import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Revision, Modo } from './revision';
import { LotesVista } from './lotes';
import { CasosVista } from './casos';
import { ExportacionesVista } from './exportaciones';
import { Sesion } from '../../nucleo/sesion';
import { FmtPipe } from '../../nucleo/formato';
import { Recorrido } from '../../nucleo/recorrido';

@Component({
  selector: 'app-incidencias',
  imports: [LotesVista, CasosVista, ExportacionesVista, FmtPipe, Recorrido],
  templateUrl: './incidencias.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidenciasPagina {
  protected readonly rev = inject(Revision);
  protected readonly sesion = inject(Sesion);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly ocupado = computed(() => this.rev.guardando() > 0 || this.rev.enviando());

  constructor() {
    this.rev.abrir();
    // «Ejecutar ahora» desde el analista: se pide la misma confirmación que con el botón
    if (this.ruta.snapshot.queryParamMap.get('ejecutar') && this.sesion.puede('gestor')) {
      this.rev.confirmarEjecutar.set(!this.rev.ejecucion());
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  protected modo(m: Modo): void {
    this.rev.setModo(m);
  }
}
