import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sesion } from './nucleo/sesion';
import { TituloPagina } from './nucleo/titulo';
import { FmtPipe, iniciales, nombreDeCorreo } from './nucleo/formato';
import { Revision } from './paginas/incidencias/revision';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FmtPipe],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.ocupado]': 'sesion.ocupado() > 0' },
})
export class App {
  protected readonly sesion = inject(Sesion);
  protected readonly titulo = inject(TituloPagina);
  protected readonly revision = inject(Revision);
  protected readonly iniciales = iniciales;
  protected readonly nombreDeCorreo = nombreDeCorreo;

  protected recargar(): void {
    location.reload();
  }
}
