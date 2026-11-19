import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FmtPipe, fmt } from './formato';

/**
 * El recorrido de las correcciones de la última ejecución: cuántos casos están pendientes de revisar,
 * cuántos están decididos y por exportar y cuántos se han exportado ya a JD Edwards. Los rechazados
 * (no eran un error) se cuentan aparte. Una barra segmentada y su leyenda; en la portada, en pequeño.
 */
@Component({
  selector: 'app-recorrido',
  imports: [FmtPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="recorrido" [class.compacto]="compacto()">
      <div class="rc-barra" role="img" [attr.aria-label]="resumen()">
        @for (t of tramos(); track t.k) {
          @if (t.n) {<i [class]="'rc-' + t.k" [style.flex-grow]="t.n"></i>}
        }
      </div>
      <ol class="rc-tramos">
        @for (t of tramos(); track t.k) {
          <li [class]="'rc-' + t.k"><b class="cnt">{{ t.n | fmt }}</b> <span>{{ t.texto }}</span></li>
        }
      </ol>
    </div>
  `,
})
export class Recorrido {
  readonly pendientes = input(0);
  readonly porExportar = input(0);
  readonly exportadas = input(0);
  readonly rechazadas = input(0);
  readonly compacto = input(false);

  protected readonly tramos = computed(() => [
    { k: 'pend', n: this.pendientes() || 0, texto: 'pendientes de revisar' },
    { k: 'dec', n: this.porExportar() || 0, texto: 'por exportar' },
    { k: 'exp', n: this.exportadas() || 0, texto: 'exportadas a JD Edwards' },
    { k: 'rech', n: this.rechazadas() || 0, texto: 'rechazadas' },
  ]);

  protected readonly resumen = computed(() => this.tramos().map(t => `${fmt(t.n)} ${t.texto}`).join(', '));
}
