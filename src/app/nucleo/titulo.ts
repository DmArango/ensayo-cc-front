import { Injectable, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Título de la pestaña y de la miga de pan de la barra superior. */
@Injectable({ providedIn: 'root' })
export class TituloPagina extends TitleStrategy {
  private readonly title = inject(Title);
  readonly actual = signal('');

  override updateTitle(estado: RouterStateSnapshot): void {
    const t = this.buildTitle(estado) || '';
    this.actual.set(t);
    this.title.setTitle(t ? `${t} · Calidad del maestro de clientes` : 'Calidad del maestro de clientes');
  }
}
