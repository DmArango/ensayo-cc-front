import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConversacionAnalista } from './conversacion';
import { Sesion } from '../../nucleo/sesion';
import { FmtPipe, TIPO, fmt, pct } from '../../nucleo/formato';
import { FilaPrueba, Mensaje, Propuesta, Prueba } from '../../nucleo/tipos';
import { Recorrido } from '../../nucleo/recorrido';

@Component({
  selector: 'app-analista',
  imports: [NgTemplateOutlet, RouterLink, FmtPipe, Recorrido],
  templateUrl: './analista.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalistaPagina {
  protected readonly c = inject(ConversacionAnalista);
  protected readonly sesion = inject(Sesion);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private viva = true;
  protected readonly TIPO = TIPO;
  protected readonly fmt = fmt;
  protected readonly pct = pct;

  private readonly scroll = viewChild<ElementRef<HTMLElement>>('chatScroll');
  private readonly cuadro = viewChild<ElementRef<HTMLTextAreaElement>>('prompt');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Con la conversación vacía (y sin regla que modificar) el cuadro de mensaje va en el centro. */
  protected readonly enHeroe = computed(() => this.c.vacia() && !this.c.reglaBase());
  protected readonly placeholder = computed(() => {
    const b = this.c.reglaBase();
    if (b && this.c.vacia()) return `¿Qué quieres cambiar de ${b.rule_id}?`;
    if (this.c.vacia()) return 'Por ejemplo: si el cliente tiene la dirección en España, el mercado tiene que ser NAC; si no, EXT.';
    return this.c.dudasPendientes() ? 'Responde a sus dudas…' : 'Pide un ajuste o haz otra petición…';
  });
  /** Peticiones de ejemplo de la portada, sobre los campos de la vista de clientes. */
  protected readonly EJEMPLOS = [
    'Todos los clientes tienen que tener informado el segmento comercial',
    '¿Qué valores tiene hoy el mercado de los clientes de cada país?',
    'Revisa si la forma jurídica del nombre del cliente está bien escrita (S.L., S.A., GmbH…)',
  ];

  /** Lleva una petición de ejemplo al cuadro, para enviarla o ajustarla antes. */
  protected usarEjemplo(texto: string): void {
    const t = this.cuadro()?.nativeElement;
    if (!t) return;
    t.value = texto;
    this.autoAlto();
    t.focus();
  }
  /** Hay texto en el cuadro de mensaje (el botón «Enviar» solo se activa entonces). */
  protected readonly hayTexto = signal(false);
  /** El usuario ha subido en la conversación: no se le baja solo y se ofrece «Ir al final». */
  protected readonly lejosDelFinal = signal(false);
  private enviado = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.viva = false));
    // con ?conversacion=… se abre esa conversación. Sin ella: si el usuario estaba trabajando en una
    // (la empezó o escribió en ella), se vuelve a esa; si solo había abierto una anterior para
    // consultarla, el inicio del analista. Un primer mensaje en camino o una regla que modificar se quedan.
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe(q => {
      const id = q.get('conversacion');
      if (id) {
        if (id !== this.c.id()) this.c.abrir(id).then(ok => { if (!ok && this.viva && this.idEnRuta() === id) this.irA(null); });
        return;
      }
      if (this.c.id() && this.c.propia()) { this.irA(this.c.id(), true); return; }
      if (this.c.id()) this.c.nueva();
      else if (this.c.vacia() && !this.c.reglaBase() && this.c.idPropia()) { this.irA(this.c.idPropia(), true); return; }
      if (this.c.vacia() && !this.c.recientes()) this.c.cargarRecientes();
    });
    // al llegar un mensaje o un paso nuevo, la conversación baja hasta el final, salvo que el usuario
    // esté leyendo más arriba (como en cualquier chat); al enviar, siempre
    effect(() => {
      this.c.mensajes().length;
      this.c.enCurso()?.pasos.length;
      const s = this.scroll()?.nativeElement;
      if (!s || this.c.vacia()) return;
      if (this.enviado || !untracked(() => this.lejosDelFinal())) {
        this.enviado = false;
        setTimeout(() => s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }), 30);
      }
    });
    // cuando el analista termina, el cursor vuelve al cuadro de mensaje
    let ocupado = false;
    effect(() => {
      const ahora = this.c.ocupado();
      if (ocupado && !ahora) setTimeout(() => this.cuadro()?.nativeElement.focus(), 30);
      ocupado = ahora;
    });
    // lo que otra parte de la pantalla deja en el borrador pasa al cuadro de mensaje
    effect(() => {
      const b = this.c.borrador();
      const t = this.cuadro()?.nativeElement;
      if (b && t) {
        t.value = b;
        this.autoAlto();
        t.focus();
        this.c.borrador.set('');
      }
    });
  }

  protected teclaEnCuadro(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.enviar();
    } else if (e.key === 'Escape' && this.c.ocupado()) {
      e.preventDefault();
      this.c.cancelar();
    }
  }

  /** Mientras el analista trabaja, el botón de enviar pasa a ser «Detener». */
  protected detener(): void {
    this.c.cancelar();
  }

  protected alDesplazar(): void {
    const s = this.scroll()?.nativeElement;
    if (s) this.lejosDelFinal.set(s.scrollHeight - s.scrollTop - s.clientHeight > 160);
  }

  protected irAlFinal(): void {
    const s = this.scroll()?.nativeElement;
    s?.scrollTo({ top: s.scrollHeight, behavior: 'smooth' });
  }

  protected async copiar(m: Mensaje): Promise<void> {
    try {
      await navigator.clipboard.writeText(m.texto);
      this.sesion.avisar('Respuesta copiada');
    } catch {
      this.sesion.avisar('No se ha podido copiar: selecciona el texto y cópialo');
    }
  }

  /** Acepta los supuestos del analista y enseña la propuesta con su prueba. */
  protected seguirConSupuestos(): void {
    this.c.aceptaSupuestos.set(true);
    setTimeout(() => this.verPanel(), 60);
  }

  protected responderDudas(): void {
    this.cuadro()?.nativeElement.focus();
  }

  protected autoAlto(): void {
    const t = this.cuadro()?.nativeElement;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(200, t.scrollHeight) + 'px';
    this.hayTexto.set(!!t.value.trim());
  }

  protected async enviar(): Promise<void> {
    const t = this.cuadro()?.nativeElement;
    if (!t || !t.value.trim() || this.c.ocupado()) return;
    const texto = t.value;
    t.value = '';
    this.autoAlto();
    this.enviado = true;
    await this.c.enviar(texto);
    // la conversación nueva ya tiene número: pasa a la dirección (sin añadir un paso al historial)
    const id = this.c.id();
    if (id && this.viva && this.idEnRuta() !== id) this.irA(id, true);
  }

  private idEnRuta(): string | null {
    return this.ruta.snapshot.queryParamMap.get('conversacion');
  }

  private irA(id: string | null, reemplazar = !id): void {
    this.router.navigate(['/analista'], { queryParams: id ? { conversacion: id } : {}, replaceUrl: reemplazar });
  }

  protected nueva(): void {
    this.c.nueva();
    this.c.cargarRecientes();
    if (this.idEnRuta()) this.irA(null, false);
    setTimeout(() => this.cuadro()?.nativeElement.focus(), 30);
  }

  protected abrirReciente(id: string, menu?: HTMLDetailsElement): void {
    if (menu) menu.open = false;
    if (id !== this.c.id()) this.irA(id);
  }

  protected verRecientes(e: Event): void {
    if ((e.target as HTMLDetailsElement).open) this.c.cargarRecientes();
  }

  protected verPanel(): void {
    this.panel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected ejecutarAhora(): void {
    this.router.navigate(['/incidencias'], { queryParams: { ejecutar: 1 } });
  }

  // ---------------- propuesta ----------------
  protected clave(f: FilaPrueba, ia: boolean): string {
    return ia ? `${f.an8}` : `${f.an8}|${f.campo || ''}`;
  }

  protected esUltima(i: number): boolean {
    return i === this.c.ultimaAgente();
  }

  protected chipCuenta(m: Mensaje): string {
    const p = m.propuesta!, pr = m.prueba || ({} as Prueba);
    if (p.tipo === 'consulta') return `${fmt((pr.filas || []).length)} filas`;
    if (p.tipo === 'ia_razonamiento') return `${fmt(pr.candidatos)} textos`;
    return `${fmt(pr.casos)} casos`;
  }

  protected tienePanel(m: Mensaje): boolean {
    return this.c.panel() === m;
  }

  protected columnas(pr: Prueba | null | undefined): string[] {
    const f = pr?.filas || [];
    return f.length ? Object.keys(f[0]) : [];
  }

  protected esNumero(v: unknown): boolean {
    return typeof v === 'number';
  }

  protected celda(v: unknown): string {
    return typeof v === 'number' ? fmt(v) : v == null ? '' : String(v);
  }

  protected maxGrupo(pr: Prueba): number {
    return Math.max(1, ...(pr.grupos || []).map(g => g.n));
  }

  protected estimados(pr: Prueba): number {
    return Math.round((pr.candidatos || 0) * ((pr.marcados || 0) / Math.max(1, pr.evaluados || 0)));
  }

  protected readonly revision = computed(() => {
    const m = this.c.propuesta();
    if (!m || m.propuesta!.tipo === 'consulta') return null;
    const p: Propuesta = m.propuesta!, pr = m.prueba, ia = p.tipo === 'ia_razonamiento';
    const valores = Object.values(this.c.conf());
    const si = valores.filter(x => x === 'si').length, no = valores.filter(x => x === 'no').length;
    const dudas = !(p.preguntas || []).length || this.c.aceptaSupuestos();
    const probada = !!pr && pr.ok && (ia ? (pr.candidatos || 0) > 0 : (pr.casos || 0) > 0);
    const muestra = (pr?.muestra || []).length;
    const muestraOk = si >= Math.min(3, muestra) && no === 0;
    const checks: [string, boolean][] = [
      ['Dudas resueltas o supuestos aceptados', dudas],
      ['Probada sobre el maestro', probada],
      [`Muestra confirmada (${si} de al menos ${Math.min(3, muestra)})`, muestraOk],
    ];
    return { ia, si, no, minimo: Math.min(3, muestra), checks, listo: checks.every(x => x[1]) };
  });

  protected muestraRegla(pr: Prueba): FilaPrueba[] {
    return (pr.muestra || []).slice(0, 8);
  }

  protected vacio(v: string | null | undefined): boolean {
    return !String(v || '').trim();
  }

  protected calidad(registros: number, conIncidencias: number): number {
    return registros ? Math.round((1 - conIncidencias / registros) * 100) : 100;
  }

  protected fecha(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  protected textoFallo(m: Mensaje): string {
    if (m.estado === 'cancelada') return 'Cancelaste esta petición.';
    if (m.estado === 'interrumpida') return 'La petición se interrumpió antes de terminar.';
    return m.error || 'El analista no pudo responder a este mensaje.';
  }
}
