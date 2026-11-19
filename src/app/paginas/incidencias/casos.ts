import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Revision, clave } from './revision';
import { Sesion } from '../../nucleo/sesion';
import { FmtPipe, codigos, corta, fmt, suave } from '../../nucleo/formato';
import { Caso, Ficha, Opcion, Situacion } from '../../nucleo/tipos';

const SIT_T: Record<Situacion, string> = { pendiente: 'Pendientes', decidida: 'Por exportar', rechazada: 'Rechazados', exportada: 'Exportados' };
/** Facturación y entrega (invoicing_delivery_status de la vista de clientes). */
const ESTADO: Record<string, string> = { 'Delivery only': 'Solo entrega', 'Invoicing and delivery': 'Factura y entrega', Inactive: 'Inactivo' };
const SIT_TAG: Record<string, [string, string]> = {
  pendiente: ['Pendiente', 'tag-warn'], decidida: ['Por exportar', 'tag-ok'], rechazada: ['Rechazado', 'tag-bad'], exportada: ['Exportado', 'tag-ok'],
};
const VERBO: Record<string, string> = { aceptar: 'Aceptó', corregir: 'Corrigió', rechazar: 'Rechazó', deshacer: 'Devolvió a pendiente', error_carga: 'Error al cargar en JD Edwards' };

@Component({
  selector: 'app-casos',
  imports: [FmtPipe],
  templateUrl: './casos.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'tecla($event)' },
})
export class CasosVista {
  protected readonly rev = inject(Revision);
  protected readonly sesion = inject(Sesion);
  protected readonly SIT_T = SIT_T;
  protected readonly SITUACIONES: Situacion[] = ['pendiente', 'decidida', 'rechazada', 'exportada'];
  protected readonly corta = corta;
  protected readonly suave = suave;
  protected readonly valorForm = signal('');

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  private readonly campoForm = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('campoForm');
  private tBusca?: ReturnType<typeof setTimeout>;

  constructor() {
    // la ficha del caso siguiente, por adelantado
    effect(() => {
      const c = this.rev.cas(), i = this.rev.ci();
      const sig = c?.casos[i + 1];
      if (sig) untracked(() => this.rev.ficha(sig));
    });
    // el caso actual siempre a la vista dentro de la lista, sin mover la página
    effect(() => {
      this.rev.ci();
      this.rev.cas();
      setTimeout(() => {
        const box = this.lista()?.nativeElement;
        const q = box?.querySelector<HTMLElement>('.qitem[aria-current=true]');
        if (!box || !q || box.scrollHeight <= box.clientHeight) return;
        if (q.offsetTop < box.scrollTop) box.scrollTop = q.offsetTop;
        else if (q.offsetTop + q.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = q.offsetTop + q.offsetHeight - box.clientHeight;
      });
    });
    // al abrir el formulario, el foco va al campo
    effect(() => {
      if (this.rev.form()) setTimeout(() => { const e = this.campoForm()?.nativeElement; if (e) { e.focus(); e.select(); } });
    });
  }

  // ---------------- filtros ----------------
  protected readonly conFiltros = computed(() => {
    const f = this.rev.f();
    return !!(f.rule_id || f.lote || f.pais || f.q);
  });

  /** Con filtros, solo se cuenta la situación que se está viendo (los totales generales no los respetarían). */
  protected cuenta(s: Situacion): number {
    if (this.conFiltros()) return s === this.rev.f().situacion ? this.rev.cas()?.total || 0 : 0;
    const i = this.sesion.inicio();
    return s === 'pendiente' ? i?.pendientes || 0 : s === 'decidida' ? this.rev.porExportar() : s === 'rechazada' ? i?.rechazadas || 0 : i?.exportadas || 0;
  }

  protected opciones(lista: Opcion[] | undefined, v: string): Opcion[] {
    const l = (lista || []).slice();
    if (v && !l.some(x => x.v === v)) l.unshift({ v, n: 0 });
    return l;
  }

  protected elegir(k: 'rule_id' | 'lote' | 'pais', e: Event): void {
    this.rev.filtrar({ [k]: (e.target as HTMLSelectElement).value });
  }

  protected buscar(e: Event, ya = false): void {
    const q = (e.target as HTMLInputElement).value.trim();
    clearTimeout(this.tBusca);
    this.tBusca = setTimeout(() => this.rev.filtrar({ q }), ya ? 0 : 450);
  }

  protected situacion(s: Situacion): void {
    this.rev.filtrar({ situacion: s });
  }

  // ---------------- lista ----------------
  protected readonly cabecera = computed(() => {
    const c = this.rev.cas();
    if (!c) return '';
    const hechos = this.rev.f().situacion === 'pendiente' ? c.casos.filter(x => this.rev.estado(x).hecho).length : 0;
    return fmt(c.total - hechos);
  });

  protected nombrePais(v: string): string {
    const p = (this.rev.cas()?.paises || []).find(x => x.v === v);
    return p && p.t ? p.t : v;
  }

  protected textoMas(quedan: number): string {
    return quedan > 100 ? `Cargar 100 más · quedan ${fmt(quedan)}` : quedan === 1 ? 'Cargar el que queda' : `Cargar los ${fmt(quedan)} que quedan`;
  }

  // ---------------- caso ----------------
  protected abrirForm(t: 'corregir' | 'rechazar'): void {
    const c = this.rev.actual();
    if (!c) return;
    const ia = c.tipo === 'ia_razonamiento';
    this.valorForm.set(t === 'corregir'
      ? (c.accion === 'corregir' ? c.valor_decidido || '' : c.propuesta || (ia ? String(c.valor_actual || '').trim() : ''))
      : (c.accion === 'rechazar' ? c.motivo_decision || '' : ''));
    this.rev.abrirForm(t);
  }

  protected guardarForm(): void {
    const t = this.rev.form();
    if (t) this.rev.decidir(t, this.valorForm());
  }

  protected escribir(e: Event): void {
    this.valorForm.set((e.target as HTMLInputElement).value);
    this.rev.formError.set('');
  }

  protected textoDecision(c: Caso): string {
    const a = this.rev.estado(c).a;
    if (a === 'exportada') return `Incluido en una exportación: «${c.valor_decidido || ''}».`;
    if (a === 'aceptar') return 'Propuesta aceptada.';
    if (a === 'corregir') return `Corregido a «${c.valor_decidido || ''}».`;
    return `Rechazado: ${c.motivo_decision || ''}`;
  }

  protected quien(c: Caso): string {
    if (c.guardando) return 'Guardando…';
    return c.usuario_decision ? c.usuario_decision + (c.fecha_decision ? ' · ' + c.fecha_decision : '') : '';
  }

  protected vacio(v: string | null | undefined): boolean {
    return !String(v || '').trim();
  }

  // ---------------- ficha ----------------
  protected readonly ficha = computed(() => {
    this.rev.fichasTick();
    const c = this.rev.actual();
    if (!c) return null;
    const x = this.rev.ficha(c);
    return { f: x.f, error: x.error, v: x.f ? this.vista(c, x.f) : null };
  });

  private vista(c: Caso, F: Ficha) {
    const cli = F.cliente;
    const act = String(c.valor_actual || '').trim(), prop = c.propuesta || '';
    const igual = (v: string) => (v === prop && prop ? 'propuesta' : v === act ? 'actual' : '');
    const pend = new Set((F.otras_incidencias || []).filter(o => o.situacion === 'pendiente').map(o => o.columna || ''));
    const lista = this.rev.cas()?.casos || [];
    return {
      cli,
      estado: cli?.estado ? ESTADO[cli.estado] || cli.estado : '',
      inactivo: cli?.estado === 'Inactive',
      corregible: F.corregible,
      habitual: (F.habitual || []).map(h => ({ ...h, clase: h.v === prop && prop ? 'pro' : h.v === act ? 'act' : '', igual: igual(h.v) })),
      totalHabitual: (F.habitual || []).reduce((a, h) => a + h.n, 0),
      pend,
      datos: (F.datos || []).map(d => ({
        ...d, sig: codigos(d.ayuda)[d.valor] || '', on: d.col === F.campo_revisado, inc: pend.has(d.col),
        titulo: d.ayuda + (d.jde ? '' : ' No se corrige en JD Edwards.'),
      })),
      otrasInc: (F.otras_incidencias || []).map(o => {
        const i = lista.findIndex(y => clave(y) === clave({ ...o, an8: c.an8 }));
        const e = i >= 0 ? this.rev.estado(lista[i]) : null;
        const tag: [string, string] = e ? (e.hecho ? [e.tag, e.tagClase] : SIT_TAG['pendiente']) : SIT_TAG[o.situacion] || ['', ''];
        return { ...o, i, tag };
      }),
      decisiones: (F.decisiones || []).map(d => ({
        ...d, verbo: VERBO[d.accion] || d.accion,
        extra: (d.accion === 'rechazar' || d.accion === 'error_carga') && d.motivo ? ': ' + d.motivo : d.valor ? ': «' + corta(d.valor, 40) + '»' : '',
      })),
    };
  }

  // ---------------- teclado ----------------
  protected tecla(e: KeyboardEvent): void {
    if (!this.rev.cas() || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest && t.closest('.decform')) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.guardarForm(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.rev.cerrarForm(); }
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'a') { e.preventDefault(); this.rev.decidir('aceptar'); }
    else if (k === 'c') { e.preventDefault(); this.abrirForm('corregir'); }
    else if (k === 'r') { e.preventDefault(); this.abrirForm('rechazar'); }
    else if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); this.rev.moverCaso(1); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); this.rev.moverCaso(-1); }
  }
}
