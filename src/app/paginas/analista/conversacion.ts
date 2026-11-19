import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, ErrorApi } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { esRegla } from '../../nucleo/formato';
import { ConversacionReciente, EstadoPeticion, Mensaje, Paso, ReglaBase, Respuesta } from '../../nucleo/tipos';

const CADA_MS = 1500;
/** La conversación en la que trabaja el usuario (ver `propia`), para que siga siéndolo al recargar. */
const CLAVE_PROPIA = 'maestro.conversacion-propia';

function leerPropia(): string | null {
  try { return sessionStorage.getItem(CLAVE_PROPIA); } catch { return null; }
}
function guardarPropia(id: string | null): void {
  try { if (id) sessionStorage.setItem(CLAVE_PROPIA, id); else sessionStorage.removeItem(CLAVE_PROPIA); } catch { /* sin almacenamiento */ }
}

interface EnCurso { peticion_id: string; pasos: Paso[]; inicio: number; cancelando: boolean; fallos: number }

/**
 * La conversación con el analista. El analista trabaja en segundo plano en el servidor: al enviar,
 * la API responde al instante y aquí se consulta el avance cada poco (pasos, respuesta o error).
 * Cada conversación tiene su dirección (/analista?conversacion=…), como en cualquier chat: al recargar
 * o volver atrás se recupera y sigue donde estaba. «Analista» en el menú vuelve a la conversación en la
 * que el usuario está trabajando (`propia`) o, si solo consultaba una anterior, al inicio. Dejar una
 * conversación no cancela lo que el analista esté haciendo: termina en el servidor y queda guardado.
 */
@Injectable({ providedIn: 'root' })
export class ConversacionAnalista {
  private readonly api = inject(Api);
  private readonly sesion = inject(Sesion);

  readonly id = signal<string | null>(null);
  readonly mensajes = signal<Mensaje[]>([]);
  readonly reglaBase = signal<ReglaBase | null>(null);
  readonly enCurso = signal<EnCurso | null>(null);
  readonly reloj = signal(0);
  readonly conf = signal<Record<string, 'si' | 'no'>>({});
  readonly aceptaSupuestos = signal(false);
  readonly activada = signal<{ rule_id: string; version: number } | null>(null);
  readonly recientes = signal<ConversacionReciente[] | null>(null);
  readonly cargando = signal(false);
  /**
   * El usuario ha escrito en esta conversación desde que la empezó o la abrió: es su trabajo en curso y
   * se le devuelve a ella al volver al analista. Una conversación anterior abierta solo para consultarla
   * no lo es: al volver por el menú se ve el inicio.
   */
  readonly propia = signal(false);
  /** La conversación propia guardada en esta sesión del navegador, aunque no esté cargada (p. ej. tras recargar). */
  idPropia(): string | null {
    return leerPropia();
  }
  /** Texto para el cuadro de mensaje (p. ej. al marcar un caso como incorrecto o al reenviar). */
  readonly borrador = signal('');

  readonly ocupado = computed(() => !!this.enCurso());
  readonly vacia = computed(() => this.mensajes().length === 0);
  readonly ultimaAgente = computed(() => {
    const m = this.mensajes();
    for (let i = m.length - 1; i >= 0; i--) if (m[i].rol === 'agente') return i;
    return -1;
  });
  readonly propuesta = computed(() => {
    const i = this.ultimaAgente();
    const m = i >= 0 ? this.mensajes()[i] : null;
    return m && m.propuesta && (m.propuesta.tipo === 'consulta' || (esRegla(m.propuesta.tipo) && m.propuesta.sql)) ? m : null;
  });
  /**
   * La última propuesta de regla tiene dudas sin resolver: hasta que el usuario las responda (con un
   * mensaje, que trae una propuesta nueva) o acepte los supuestos, no se enseñan la regla ni su prueba.
   */
  readonly dudasPendientes = computed(() => {
    const m = this.propuesta();
    return !!m && m.propuesta!.tipo !== 'consulta' && !!(m.propuesta!.preguntas || []).length && !this.aceptaSupuestos() && !this.activada();
  });
  /** Lo que se enseña en el panel lateral: la propuesta, salvo que tenga dudas pendientes. */
  readonly panel = computed(() => (this.dudasPendientes() ? null : this.propuesta()));
  /** Título de la conversación: el primer mensaje del usuario. */
  readonly titulo = computed(() => this.mensajes().find(m => m.rol === 'usuario')?.texto || '');

  private generacion = 0;
  private tReloj?: ReturnType<typeof setInterval>;

  nueva(reglaBase: ReglaBase | null = null): void {
    this.generacion++;
    this.parar();
    this.id.set(null);
    this.mensajes.set([]);
    this.reglaBase.set(reglaBase);
    this.reiniciarRevision();
    this.borrador.set('');
    this.recientes.set(null);
    this.propia.set(false);
    guardarPropia(null);
  }

  /**
   * Abre una conversación guardada y, si el analista sigue trabajando en ella, retoma el avance.
   * Devuelve false si no existe o no es del usuario (o si mientras tanto se ha abierto otra cosa).
   */
  async abrir(id: string): Promise<boolean> {
    const gen = ++this.generacion;
    this.parar();
    this.cargando.set(true);
    this.propia.set(leerPropia() === id);
    try {
      const c = await this.api.conversacion(id);
      if (gen !== this.generacion) return false;
      this.id.set(c.conversacion_id);
      this.reglaBase.set(c.regla_base);
      this.mensajes.set(c.mensajes);
      this.reiniciarRevision();
      this.activada.set(c.activada || null);
      if (c.en_curso) this.seguir(c.en_curso, gen);
      return true;
    } catch (e) {
      if (gen !== this.generacion) return false;
      if (e instanceof ErrorApi && (e.estado === 404 || e.estado === 403)) this.sesion.avisar('Esa conversación no existe o no es tuya');
      else this.sesion.fallo(e);
      return false;
    } finally {
      if (gen === this.generacion) this.cargando.set(false);
    }
  }

  async cargarRecientes(): Promise<void> {
    try { this.recientes.set((await this.api.conversaciones('', '', 10)).conversaciones); } catch { this.recientes.set([]); }
  }

  private turnoSiguiente(): number {
    return Math.max(0, ...this.mensajes().filter(m => m.rol === 'usuario').map(m => m.turno || 0)) + 1;
  }

  /** Envía un mensaje. Devuelve false si no se ha podido (el texto vuelve al cuadro). */
  async enviar(texto: string): Promise<boolean> {
    texto = texto.trim();
    if (!texto || this.ocupado()) return false;
    this.sesion.error.set('');
    const gen = this.generacion, turno = this.turnoSiguiente();
    this.mensajes.update(l => [...l, { rol: 'usuario', texto, turno, estado: 'en_curso' }]);
    this.propia.set(true);
    this.reiniciarRevision();
    this.enCurso.set({ peticion_id: '', pasos: [], inicio: Date.now(), cancelando: false, fallos: 0 });
    this.arrancarReloj();
    try {
      const r = await this.api.enviarMensaje(texto, turno, this.id(), this.id() ? null : this.reglaBase());
      if (gen !== this.generacion) return true;
      this.id.set(r.conversacion_id);
      guardarPropia(r.conversacion_id);
      this.mensajes.update(l => l.map(m => m.rol === 'usuario' && m.turno === turno ? { ...m, peticion_id: r.peticion_id } : m));
      this.seguir(r.peticion_id, gen);
      return true;
    } catch (e) {
      if (gen !== this.generacion) return false;
      this.parar();
      if (e instanceof ErrorApi && e.estado === 409 && this.id()) {   // la conversación ya tenía algo en marcha o ha cambiado
        this.sesion.fallo(e);
        await this.abrir(this.id()!);
        return false;
      }
      this.mensajes.update(l => l.filter(m => !(m.rol === 'usuario' && m.turno === turno)));
      this.borrador.set(texto);
      this.sesion.fallo(e);
      return false;
    }
  }

  /** Consulta el avance de una petición hasta que termina. */
  private seguir(peticion_id: string, gen: number): void {
    const actual = this.enCurso();
    this.enCurso.set({ peticion_id, pasos: actual?.pasos || [], inicio: actual?.inicio || Date.now(), cancelando: actual?.cancelando || false, fallos: 0 });
    this.arrancarReloj();
    const vuelta = async () => {
      if (gen !== this.generacion || !this.enCurso()) return;
      const ec = this.enCurso()!;
      try {
        const r = await this.api.estadoPeticion(peticion_id, this.id()!, ec.pasos.length);
        if (gen !== this.generacion) return;
        const pasos = [...ec.pasos, ...r.pasos];
        if (r.estado === 'en_curso') {
          this.enCurso.set({ ...this.enCurso()!, pasos, fallos: 0 });
          if (r.segundos != null) this.reloj.set(r.segundos);
          setTimeout(vuelta, CADA_MS);
          return;
        }
        this.terminar(peticion_id, r.estado, r.error, r.respuesta);
      } catch (e) {
        if (gen !== this.generacion) return;
        const fallos = ec.fallos + 1;
        this.enCurso.set({ ...ec, fallos });
        if (fallos === 3) this.sesion.fallo(e);
        setTimeout(vuelta, Math.min(15000, CADA_MS * 2 ** fallos));
      }
    };
    setTimeout(vuelta, 600);
  }

  private terminar(peticion_id: string, estado: EstadoPeticion, error: string, r: Respuesta | null): void {
    this.parar();
    this.mensajes.update(l => {
      const nueva = l.map(m => m.rol === 'usuario' && m.peticion_id === peticion_id ? { ...m, estado, error } : m);
      if (estado === 'terminada' && r) nueva.push({ rol: 'agente', texto: r.propuesta.respuesta, ...r });
      return nueva;
    });
    // el error se muestra en el propio mensaje (con «Volver a enviar»), no también en el aviso general
    if (estado === 'cancelada') this.sesion.avisar('Petición cancelada');
  }

  async cancelar(): Promise<void> {
    const ec = this.enCurso();
    if (!ec || !ec.peticion_id || ec.cancelando || !this.id()) return;
    this.enCurso.set({ ...ec, cancelando: true });
    try {
      await this.api.cancelarPeticion(ec.peticion_id, this.id()!);
    } catch (e) {
      this.enCurso.update(x => x && { ...x, cancelando: false });
      this.sesion.fallo(e);
    }
  }

  /** Vuelve a enviar un mensaje que no obtuvo respuesta. */
  reenviar(m: Mensaje): void {
    this.enviar(m.texto);
  }

  async activar(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      const a = await this.sesion.esperar(this.api.activarRegla(id, this.reglaBase()?.rule_id || ''));
      this.activada.set(a);
      this.sesion.avisar(`Regla ${a.rule_id} activada (versión ${a.version})`);
      this.sesion.cargarInicio();
    } catch (e) {
      this.sesion.fallo(e);
    }
  }

  confirmar(k: string, v: 'si' | 'no'): void {
    this.conf.update(c => ({ ...c, [k]: v }));
    if (v === 'no') {
      const [an8, campo] = k.split('|');
      this.borrador.set(`El caso del cliente ${an8}${campo ? ` (${campo})` : ''} no es correcto: `);
    }
  }

  private reiniciarRevision(): void {
    this.conf.set({});
    this.aceptaSupuestos.set(false);
    this.activada.set(null);
  }

  private arrancarReloj(): void {
    clearInterval(this.tReloj);
    const ec = this.enCurso();
    this.reloj.set(ec ? Math.round((Date.now() - ec.inicio) / 1000) : 0);
    this.tReloj = setInterval(() => this.reloj.update(s => s + 1), 1000);
  }

  private parar(): void {
    clearInterval(this.tReloj);
    this.enCurso.set(null);
  }
}
