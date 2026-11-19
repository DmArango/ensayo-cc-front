import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, ErrorApi } from './api';
import { Inicio, Perfil, Yo } from './tipos';

const NOMBRE_PERFIL: Record<Perfil, string> = { revisor: 'Revisor', gestor: 'Gestor', administrador: 'Administrador' };

/** Usuario, perfiles, resumen de la última ejecución y avisos comunes a todas las páginas. */
@Injectable({ providedIn: 'root' })
export class Sesion {
  private readonly api = inject(Api);

  readonly yo = signal<Yo | null>(null);
  readonly sinAcceso = signal('');
  readonly inicio = signal<Inicio | null>(null);
  readonly error = signal('');
  readonly aviso = signal('');
  readonly ocupado = signal(0);
  readonly perfiles = computed(() => (this.yo()?.perfiles || []).map(p => NOMBRE_PERFIL[p]).join(' · '));
  private tAviso?: ReturnType<typeof setTimeout>;

  /** Al arrancar: quién es y qué puede hacer. Sin perfil, la aplicación muestra el motivo. */
  async cargar(): Promise<void> {
    try {
      this.yo.set(await this.api.yo());
      this.cargarInicio();
    } catch (e) {
      this.sinAcceso.set(e instanceof ErrorApi && (e.estado === 403 || e.estado === 401) ? e.message
        : 'No se ha podido comprobar tu acceso: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  puede(p: Perfil): boolean {
    const y = this.yo();
    return !!y && (y.perfiles.includes('administrador') || y.perfiles.includes(p));
  }

  async cargarInicio(): Promise<void> {
    try {
      this.inicio.set(await this.api.inicio());
    } catch (e) {
      this.fallo(e);
    }
  }

  avisar(m: string): void {
    this.aviso.set(m);
    clearTimeout(this.tAviso);
    this.tAviso = setTimeout(() => this.aviso.set(''), 3600);
  }

  fallo(e: unknown): void {
    this.error.set(e instanceof Error ? e.message : String(e));
  }

  /** Marca la aplicación como ocupada mientras dura la operación. */
  async esperar<T>(p: Promise<T>): Promise<T> {
    this.ocupado.update(n => n + 1);
    try {
      return await p;
    } finally {
      this.ocupado.update(n => n - 1);
    }
  }
}
