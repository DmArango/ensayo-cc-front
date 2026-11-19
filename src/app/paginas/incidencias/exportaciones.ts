import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Revision } from './revision';
import { Sesion } from '../../nucleo/sesion';
import { FmtPipe, fmt } from '../../nucleo/formato';
import { Exportacion } from '../../nucleo/tipos';

/** Qué hacer con una corrección retenida, según el motivo. */
function queHacer(motivo: string): string {
  if (/dos reglas/i.test(motivo)) return 'Dos reglas proponen valores distintos para el mismo campo: abre los casos, deja el valor correcto y rechaza el otro.';
  if (/ha cambiado/i.test(motivo)) return 'El valor cambió en JD Edwards después de detectarlo: vuelve el caso a pendiente o recházalo; la próxima ejecución lo recalculará.';
  if (/no se puede corregir/i.test(motivo)) return 'Este campo no se puede exportar desde la aplicación: rechaza el caso indicando el motivo.';
  return 'Revisa el caso y decide de nuevo.';
}

@Component({
  selector: 'app-exportaciones',
  imports: [FmtPipe],
  templateUrl: './exportaciones.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportacionesVista {
  protected readonly rev = inject(Revision);
  protected readonly sesion = inject(Sesion);
  protected readonly queHacer = queHacer;

  protected carga(e: Exportacion): string {
    if (!e.volcadas && !e.errores) return 'Pendiente de cargar';
    return `${fmt(e.volcadas)} de ${fmt(e.correcciones)} cargadas` + (e.errores ? ` · ${fmt(e.errores)} con error` : '');
  }

  /** Motivos distintos de las retenidas, con cuántas hay de cada uno. */
  protected motivos(l: { retenida: string }[]): { motivo: string; n: number }[] {
    const m = new Map<string, number>();
    l.forEach(x => m.set(x.retenida, (m.get(x.retenida) || 0) + 1));
    return [...m].map(([motivo, n]) => ({ motivo, n }));
  }
}
