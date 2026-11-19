import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Api } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { fmt } from '../../nucleo/formato';
import {
  Accion, Caso, Casos, Exportacion, Ficha, FilaLote, FiltroCasos, Lote, ResultadoExportacion, Situacion,
} from '../../nucleo/tipos';

export type Modo = 'lotes' | 'casos' | 'exportaciones';
export const clave = (x: { rule_id: string; an8: number; columna?: string | null }) =>
  [x.rule_id, x.an8, x.columna || ''].join('|');
const ahora = () => {
  const d = new Date(), z = (n: number) => String(n).padStart(2, '0');
  return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
};
const CLAVE_EJECUCION = 'maestro.ejecucion';
const filtroVacio = (situacion: Situacion = 'pendiente'): FiltroCasos => ({ situacion, rule_id: '', lote: '', pais: '', q: '' });

interface EnCola { c: Caso; d: { run_id: string; rule_id: string; an8: number; columna: string; accion: Accion; valor: string; motivo: string } }
interface FichaCargada { f: Ficha | null; error: string | null }

/**
 * Estado de la revisión de incidencias (se conserva al cambiar de página).
 * Las decisiones caso a caso se anotan al momento en la pantalla y se guardan en segundo plano:
 * el revisor pasa al caso siguiente sin esperar. Las que se toman mientras se guarda la anterior viajan juntas.
 */
@Injectable({ providedIn: 'root' })
export class Revision {
  private readonly api = inject(Api);
  private readonly sesion = inject(Sesion);

  readonly modo = signal<Modo>('lotes');

  // ---------------- lotes ----------------
  readonly lotes = signal<Lote[] | null>(null);
  readonly lote = signal<Lote | null>(null);
  readonly muestra = signal<FilaLote[] | null>(null);
  readonly excluidos = signal<Set<string>>(new Set());
  readonly confirmarLote = signal(false);
  private lotesViejos = false;

  // ---------------- caso a caso ----------------
  readonly f = signal<FiltroCasos>(filtroVacio());
  readonly cas = signal<Casos | null>(null);
  readonly ci = signal(0);
  readonly form = signal<'corregir' | 'rechazar' | null>(null);
  readonly formError = signal('');
  readonly enviando = signal(false);
  readonly porExportar = signal(0);
  readonly fichasTick = signal(0);
  private cola: EnCola[] = [];
  private fichas = new Map<string, FichaCargada>();
  private casTk = 0;

  readonly actual = computed(() => this.cas()?.casos[this.ci()] || null);
  readonly guardando = computed(() => (this.cas()?.casos || []).filter(c => c.guardando).length);

  // ---------------- exportación ----------------
  readonly exportaciones = signal<Exportacion[] | null>(null);
  readonly confirmarExportar = signal(false);
  readonly resultado = signal<ResultadoExportacion | null>(null);

  // ---------------- ejecución de las reglas ----------------
  readonly ejecucion = signal<string | null>(null);
  /** Ejecutar todas las reglas consume BigQuery y, en las reglas con IA, el modelo: se confirma antes. */
  readonly confirmarEjecutar = signal(false);

  constructor() {
    // lo que queda por exportar sale del resumen, salvo mientras se guardan decisiones
    effect(() => {
      const i = this.sesion.inicio();
      if (i && untracked(() => !this.enviando()) && !this.cola.length) this.porExportar.set(i.por_exportar);
    });
    let n: string | null = null;
    try { n = sessionStorage.getItem(CLAVE_EJECUCION); } catch { /* sin almacenamiento */ }
    if (n) this.seguirEjecucion(n);
  }

  setModo(m: Modo): void {
    this.modo.set(m);
    if (m === 'lotes' && (!this.lotes() || this.lotesViejos)) this.cargarLotes();
    if (m === 'casos' && !this.cas()) this.cargarCasos();
    if (m === 'exportaciones') this.cargarExportaciones();
  }

  abrir(): void {
    this.setModo(this.modo());
  }

  // ======================= lotes =======================
  async cargarLotes(mantener?: Lote | null): Promise<void> {
    this.lotesViejos = false;
    try {
      const l = await this.api.lotes();
      this.lotes.set(l);
      const sig = l.find(x => mantener && x.rule_id === mantener.rule_id && x.lote === mantener.lote) || l[0];
      if (sig) this.seleccionarLote(sig);
      else this.lote.set(null);
    } catch (e) {
      this.sesion.fallo(e);
    }
  }

  async seleccionarLote(l: Lote): Promise<void> {
    this.lote.set(l);
    this.excluidos.set(new Set());
    this.confirmarLote.set(false);
    this.muestra.set(null);
    try {
      const m = await this.api.muestraLote(l);
      if (this.lote() === l) this.muestra.set(m);
    } catch (e) {
      this.sesion.fallo(e);
    }
  }

  excluir(k: string, si: boolean): void {
    const s = new Set(this.excluidos());
    if (si) s.add(k); else s.delete(k);
    this.excluidos.set(s);
    this.confirmarLote.set(false);
  }

  /** Propuestas del lote que se aceptarían (las de la muestra excluidas no cuentan). */
  readonly aAceptar = computed(() => {
    const l = this.lote();
    if (!l) return 0;
    const ex = (this.muestra() || []).filter(f => this.excluidos().has(String(f.an8)) && f.propuesta).length;
    return l.con_propuesta - ex;
  });

  async aceptarLote(): Promise<void> {
    const l = this.lote();
    if (!l) return;
    try {
      const r = await this.sesion.esperar(this.api.aceptarLote(l, [...this.excluidos()]));
      this.sesion.avisar(`${fmt(r.aceptados)} propuestas aceptadas: quedan como correcciones por exportar`);
      this.cas.set(null);
      this.fichas.clear();
      await this.sesion.cargarInicio();
      this.porExportar.set(this.sesion.inicio()?.por_exportar || 0);
      await this.cargarLotes(this.excluidos().size ? l : null);
    } catch (e) {
      this.sesion.fallo(e);
      this.confirmarLote.set(false);
    }
  }

  revisarLote(): void {
    const l = this.lote();
    if (!l) return;
    this.f.set({ ...filtroVacio(), rule_id: l.rule_id, lote: l.lote });
    this.cas.set(null);
    this.setModo('casos');
  }

  // ======================= ejecución =======================
  async ejecutar(): Promise<void> {
    this.confirmarEjecutar.set(false);
    if (this.ejecucion()) return;
    try {
      const r = await this.api.ejecutar();
      this.sesion.avisar('Ejecutando las reglas: puede tardar varios minutos. Puedes seguir trabajando.');
      this.seguirEjecucion(r.ejecucion);
    } catch (e) {
      this.sesion.fallo(e);
    }
  }

  private seguirEjecucion(nombre: string): void {
    this.ejecucion.set(nombre);
    try { sessionStorage.setItem(CLAVE_EJECUCION, nombre); } catch { /* sin almacenamiento */ }
    let fallos = 0;
    const vuelta = async () => {
      if (this.ejecucion() !== nombre) return;
      try {
        const e = await this.api.estadoEjecucion(nombre);
        fallos = 0;
        if (!e.terminada) { setTimeout(vuelta, 5000); return; }
        this.terminarEjecucion();
        if (e.ok) {
          const r = e.resultado;
          this.sesion.avisar(r ? `${fmt(r.casos)} incidencias en ${r.reglas} reglas` + (r.errores?.length ? ` · ${r.errores.length} con error` : '') : 'Reglas ejecutadas');
          if (r?.errores?.length) {
            // el detalle de BigQuery es técnico: al usuario se le dice qué reglas fallaron y qué supone
            const ids = r.errores.map(x => String(x).split(':')[0].trim()).join(', ');
            const n = r.errores.length;
            this.sesion.fallo(new Error(`La ejecución terminó, pero ${n === 1 ? 'una regla dio' : n + ' reglas dieron'} error (${ids}): sus casos no se han actualizado. ` +
              'Revisa la regla con el analista o avisa al equipo técnico, que tiene el detalle en los registros del motor.'));
          }
        } else {
          this.sesion.fallo(new Error(e.mensaje || 'La ejecución de las reglas ha fallado.'));
        }
        await this.recargarTodo();
      } catch (err) {
        if (++fallos >= 4) { this.terminarEjecucion(); this.sesion.fallo(err); return; }
        setTimeout(vuelta, 10000);
      }
    };
    setTimeout(vuelta, 3000);
  }

  private terminarEjecucion(): void {
    this.ejecucion.set(null);
    try { sessionStorage.removeItem(CLAVE_EJECUCION); } catch { /* sin almacenamiento */ }
  }

  private async recargarTodo(): Promise<void> {
    this.lote.set(null);
    this.lotes.set(null);
    this.cas.set(null);
    this.fichas.clear();
    await this.sesion.cargarInicio();
    if (this.modo() === 'casos') await this.cargarCasos();
    else if (this.modo() === 'lotes') await this.cargarLotes();
  }

  // ======================= caso a caso =======================
  async cargarCasos(mas = false): Promise<void> {
    const tk = ++this.casTk;
    const anterior = this.cas();
    if (!mas) { this.cas.set(null); this.ci.set(0); this.form.set(null); }
    const ult = mas && anterior ? anterior.casos[anterior.casos.length - 1] : null;
    try {
      const r = await this.api.casos(this.f(), ult ? ult.orden : '');
      if (tk !== this.casTk) return;
      if (mas && anterior) {
        const casos = anterior.casos.concat(r.casos);
        this.cas.set({ ...anterior, casos, total: casos.length + r.quedan, quedan: r.quedan });
      } else {
        this.cas.set(r);
      }
      if (!this.enviando() && !this.cola.length) this.porExportar.set(r.por_exportar);
    } catch (e) {
      this.sesion.fallo(e);
    }
  }

  filtrar(cambio: Partial<FiltroCasos>): void {
    const f = { ...this.f(), ...cambio };
    if ('rule_id' in cambio) f.lote = cambio.lote || '';
    this.f.set(f);
    this.cargarCasos();
  }

  /** Repinta la lista tras cambiar un caso en el sitio. */
  private tocar(): void {
    const c = this.cas();
    if (c) this.cas.set({ ...c, casos: [...c.casos] });
  }

  estado(c: Caso): { hecho: boolean; dot: string; tag: string; tagClase: string; a: string | null } {
    const a = c.situacion === 'pendiente' ? null : c.accion;
    if (c.guardando) return { hecho: !!a, dot: 'guarda', tag: 'Guardando…', tagClase: '', a };
    if (c.situacion === 'exportada') return { hecho: true, dot: 'si', tag: 'Exportado', tagClase: 'tag-ok', a: 'exportada' };
    if (a === 'rechazar') return { hecho: true, dot: 'no', tag: 'Rechazado', tagClase: 'tag-bad', a };
    if (a === 'aceptar' || a === 'corregir') return { hecho: true, dot: 'si', tag: a === 'aceptar' ? 'Aceptado' : 'Corregido', tagClase: 'tag-ok', a };
    return { hecho: false, dot: c.tipo === 'ia_razonamiento' ? 'ia' : c.propuesta ? '' : 'manual',
      tag: c.error_carga ? 'Error de carga' : '', tagClase: c.error_carga ? 'tag-bad' : '', a: null };
  }

  irCaso(i: number): void {
    const c = this.cas();
    if (!c || !c.casos[i]) return;
    this.ci.set(i);
    this.form.set(null);
  }

  async moverCaso(d: number): Promise<void> {
    const c = this.cas();
    if (!c) return;
    const j = this.ci() + d;
    if (j >= c.casos.length && c.quedan > 0) await this.cargarCasos(true);
    const n = this.cas()!;
    if (j < 0 || j >= n.casos.length) return;
    this.ci.set(j);
    this.form.set(null);
  }

  private async siguiente(): Promise<void> {
    if (this.f().situacion !== 'pendiente') return this.moverCaso(1);
    const busca = () => this.cas()!.casos.findIndex((c, i) => i > this.ci() && !this.estado(c).hecho);
    let j = busca();
    if (j < 0 && this.cas()!.quedan > 0) { await this.cargarCasos(true); j = busca(); }
    if (j < 0) { this.sesion.avisar('No quedan casos pendientes en la lista'); return; }
    this.ci.set(j);
  }

  abrirForm(t: 'corregir' | 'rechazar'): void {
    const c = this.actual();
    if (!c || c.situacion === 'exportada' || !this.sesion.puede('revisor')) return;
    this.formError.set('');
    this.form.set(t);
  }

  cerrarForm(): void {
    this.form.set(null);
  }

  decidir(accion: Accion, texto = ''): void {
    const c = this.actual();
    if (!c || c.situacion === 'exportada' || !this.sesion.puede('revisor')) return;
    let valor = '', motivo = '';
    if (accion === 'aceptar' && !c.propuesta) { this.sesion.avisar('Este caso no tiene propuesta: corrígelo (C) o recházalo (R).'); return; }
    if (accion === 'corregir') {
      valor = texto.trim();
      if (!valor) return this.formError.set('Indica el valor correcto.');
      if (valor === String(c.valor_actual || '').trim()) return this.formError.set('Es el valor que ya tiene el maestro.');
    }
    if (accion === 'rechazar') {
      motivo = texto.trim();
      if (motivo.length < 3) return this.formError.set('Indica por qué no es un error.');
    }
    if (accion === 'deshacer' && !this.estado(c).hecho) return;
    if (!c.prev) c.prev = { situacion: c.situacion, accion: c.accion, valor_decidido: c.valor_decidido, motivo_decision: c.motivo_decision, usuario_decision: c.usuario_decision, fecha_decision: c.fecha_decision };
    Object.assign(c, {
      accion: accion === 'deshacer' ? null : accion,
      situacion: accion === 'rechazar' ? 'rechazada' : accion === 'deshacer' ? 'pendiente' : 'decidida',
      valor_decidido: accion === 'aceptar' ? c.propuesta : accion === 'corregir' ? valor : null,
      motivo_decision: motivo || null,
      guardando: true,
    });
    this.cola.push({ c, d: { run_id: c.run_id, rule_id: c.rule_id, an8: c.an8, columna: c.columna || '', accion, valor, motivo } });
    this.form.set(null);
    this.tocar();
    if (accion !== 'deshacer') this.siguiente();
    this.enviarCola();
  }

  private async enviarCola(): Promise<void> {
    if (this.enviando() || !this.cola.length) return;
    // de cada caso cuenta la última decisión; volver a pendiente algo que el servidor aún tiene pendiente no se envía
    const ult = new Map<string, EnCola>();
    this.cola.splice(0).forEach(x => ult.set(clave(x.d), x));
    const envio = [...ult.values()].filter(x => {
      const nada = x.d.accion === 'deshacer' && (x.c.prev ? x.c.prev.situacion : 'pendiente') === 'pendiente';
      if (nada) { x.c.guardando = false; delete x.c.prev; }
      return !nada;
    });
    if (!envio.length) { this.tocar(); return; }
    this.enviando.set(true);
    const errores: string[] = [];
    try {
      const r = await this.api.decidir(envio.map(x => x.d));
      for (const res of r.resultados || []) {
        const x = envio.find(y => clave(y.d) === clave(res));
        if (!x) continue;
        const c = x.c, nueva = this.cola.some(y => y.c === c);
        const srv: Partial<Caso> = res.error ? c.prev! : {
          situacion: res.situacion, accion: res.situacion === 'pendiente' ? null : res.accion, valor_decidido: res.valor,
          motivo_decision: x.d.motivo || null, usuario_decision: this.sesion.yo()?.correo || '', fecha_decision: ahora(),
        };
        if (res.error) errores.push(`Cliente ${c.an8} (${c.rule_id}): ${res.error}`);
        if (nueva) c.prev = srv;
        else { Object.assign(c, srv); c.guardando = false; delete c.prev; }
      }
      this.porExportar.set(r.por_exportar);
      this.lotesViejos = true;
      this.olvidarFichas(new Set(envio.map(x => String(x.d.an8))));
      if (errores.length) this.sesion.fallo(new Error(errores.join(' · ')));
    } catch (e) {
      envio.forEach(x => {
        if (!this.cola.some(y => y.c === x.c)) { Object.assign(x.c, x.c.prev || {}); x.c.guardando = false; delete x.c.prev; }
      });
      this.sesion.fallo(e);
    }
    this.enviando.set(false);
    this.tocar();
    if (this.cola.length) this.enviarCola();
    else this.sesion.cargarInicio();
  }

  verPorExportar(): void {
    this.f.set(filtroVacio('decidida'));
    this.cas.set(null);
    this.setModo('casos');
  }

  // ---------------- ficha del cliente ----------------
  /** La ficha se pide al abrir el caso (y la del siguiente, por adelantado). */
  ficha(c: Caso): FichaCargada {
    const k = clave(c);
    let x = this.fichas.get(k);
    if (!x) {
      const nueva: FichaCargada = { f: null, error: null };
      x = nueva;
      this.fichas.set(k, nueva);
      this.api.ficha({ an8: c.an8, columna: c.columna || '', rule_id: c.rule_id })
        .then(f => { nueva.f = f; }, e => { nueva.error = e instanceof Error ? e.message : String(e); })
        .then(() => this.fichasTick.update(n => n + 1));
    }
    return x;
  }

  reintentarFicha(c: Caso): void {
    this.fichas.delete(clave(c));
    this.fichasTick.update(n => n + 1);
  }

  private olvidarFichas(an8s: Set<string>): void {
    for (const k of [...this.fichas.keys()]) if (an8s.has(k.split('|')[1])) this.fichas.delete(k);
  }

  // ======================= exportación =======================
  async cargarExportaciones(): Promise<void> {
    try { this.exportaciones.set(await this.api.exportaciones()); } catch (e) { this.sesion.fallo(e); }
  }

  async exportar(): Promise<void> {
    try {
      const r = await this.sesion.esperar(this.api.exportar());
      this.confirmarExportar.set(false);
      this.resultado.set(r);
      this.sesion.avisar(`${fmt(r.correcciones)} correcciones exportadas` + (r.retenidas ? ` · ${fmt(r.retenidas)} retenidas` : ''));
      if (r.error_fichero) this.sesion.fallo(new Error(`La exportación ${r.exportacion_id} está registrada, pero no se ha podido escribir el fichero. Vuelve a intentarlo desde «Exportaciones». Detalle: ${r.error_fichero}`));
      this.porExportar.set(0);
      this.lotes.set(null);
      this.cas.set(null);
      this.fichas.clear();
      await this.sesion.cargarInicio();
      this.setModo('exportaciones');
    } catch (e) {
      this.sesion.fallo(e);
      this.confirmarExportar.set(false);
    }
  }

  async escribirFichero(id: string): Promise<void> {
    try {
      await this.sesion.esperar(this.api.escribirFichero(id));
      this.sesion.avisar('Fichero escrito en Cloud Storage');
      await this.cargarExportaciones();
    } catch (e) {
      this.sesion.fallo(e);
    }
  }

  urlCsv(id: string): string {
    return this.api.urlCsv(id);
  }
}
