import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Revision } from './revision';
import { Sesion } from '../../nucleo/sesion';
import { FmtPipe } from '../../nucleo/formato';
import { FilaLote, Lote } from '../../nucleo/tipos';

@Component({
  selector: 'app-lotes',
  imports: [FmtPipe],
  templateUrl: './lotes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LotesVista {
  protected readonly rev = inject(Revision);
  protected readonly sesion = inject(Sesion);

  protected claveLote(l: Lote | null): string {
    return l ? l.rule_id + '|' + l.lote : '';
  }

  protected k(f: FilaLote): string {
    return String(f.an8);
  }

  protected excluido(f: FilaLote): boolean {
    return this.rev.excluidos().has(this.k(f));
  }

  protected marcar(f: FilaLote, e: Event): void {
    this.rev.excluir(this.k(f), (e.target as HTMLInputElement).checked);
  }

  protected vacio(v: string | null | undefined): boolean {
    return !String(v || '').trim();
  }
}
