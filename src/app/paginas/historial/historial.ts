import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Api } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { Actividad } from '../../nucleo/tipos';

const ICO: Record<string, [string, string]> = {
  regla: ['ia', 'i-spark'], exportacion: ['ok', 'i-check'], decision: ['', 'i-user'], ejecucion: ['', 'i-play'], conocimiento: ['', 'i-book'],
};
const VACIO: Record<string, string> = {
  todo: 'No hay actividad en los últimos 180 días.',
  regla: 'No se han creado, modificado ni retirado reglas en los últimos 180 días.',
  decision: 'No hay decisiones en los últimos 180 días.',
  exportacion: 'No se ha exportado nada en los últimos 180 días.',
  ejecucion: 'No se han ejecutado las reglas en los últimos 180 días.',
  conocimiento: 'No ha cambiado el conocimiento en los últimos 180 días.',
};

@Component({
  selector: 'app-historial',
  templateUrl: './historial.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorialPagina {
  private readonly api = inject(Api);
  private readonly sesion = inject(Sesion);

  protected readonly filtros: [string, string][] = [
    ['todo', 'Todo'], ['regla', 'Reglas'], ['decision', 'Decisiones'], ['exportacion', 'Exportaciones'], ['ejecucion', 'Ejecuciones'], ['conocimiento', 'Conocimiento'],
  ];
  protected readonly VACIO = VACIO;
  protected readonly lista = signal<Actividad[] | null>(null);
  protected readonly hayMas = signal(false);
  protected readonly cargandoMas = signal(false);
  protected readonly filtro = signal('todo');
  private tk = 0;

  constructor() {
    this.cargar();
  }

  /** El filtro se aplica en el servidor: así cada tipo muestra toda su actividad, no solo la que cabe en la última página. */
  protected elegir(f: string): void {
    if (f === this.filtro()) return;
    this.filtro.set(f);
    this.cargar();
  }

  private async cargar(mas = false): Promise<void> {
    const tk = ++this.tk;
    const antes = mas ? this.lista()?.at(-1)?.marca || '' : '';
    if (mas) this.cargandoMas.set(true); else this.lista.set(null);
    try {
      const r = await this.api.historial(this.filtro(), antes);
      if (tk !== this.tk) return;
      this.lista.set(mas ? [...(this.lista() || []), ...r.actividad] : r.actividad);
      this.hayMas.set(r.hay_mas);
    } catch (e) {
      if (tk === this.tk && !mas) this.lista.set([]);
      this.sesion.fallo(e);
    } finally {
      if (tk === this.tk) this.cargandoMas.set(false);
    }
  }

  protected mas(): void {
    this.cargar(true);
  }

  protected icono(t: string): [string, string] {
    return ICO[t] || ['', 'i-clock'];
  }
}
