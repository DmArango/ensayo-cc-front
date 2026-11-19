import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Api } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { Nota } from '../../nucleo/tipos';

@Component({
  selector: 'app-contexto',
  templateUrl: './contexto.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextoPagina {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);
  private readonly cuadro = viewChild<ElementRef<HTMLTextAreaElement>>('texto');

  protected readonly notas = signal<Nota[] | null>(null);
  protected readonly abierto = signal(false);
  /** Nota que se está editando (null = nota nueva). */
  protected readonly editando = signal<Nota | null>(null);
  protected readonly error = signal('');
  protected readonly quitar = signal<number | null>(null);

  constructor() {
    this.api.conocimiento().then(n => this.notas.set(n), e => this.sesion.fallo(e));
  }

  protected abrir(n: Nota | null = null): void {
    this.editando.set(n);
    this.error.set('');
    this.abierto.set(true);
    setTimeout(() => {
      const t = this.cuadro()?.nativeElement;
      if (!t) return;
      t.value = n ? n.texto : '';
      t.focus();
    });
  }

  protected cerrar(): void {
    const t = this.cuadro()?.nativeElement;
    if (t) t.value = '';
    this.abierto.set(false);
    this.editando.set(null);
    this.error.set('');
  }

  protected async guardar(): Promise<void> {
    const t = this.cuadro()?.nativeElement;
    if (!t) return;
    const texto = t.value.trim();
    if (texto.length < 10) return this.error.set('Explica el conocimiento en una frase completa (al menos 10 caracteres).');
    const n = this.editando();
    try {
      this.notas.set(await this.sesion.esperar(n ? this.api.editarNota(n.id, texto) : this.api.guardarNota(texto)));
      this.cerrar();
      this.sesion.avisar((n ? 'Nota modificada' : 'Conocimiento añadido') + ': el analista lo usará desde el siguiente mensaje');
      this.sesion.cargarInicio();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected async borrar(n: Nota): Promise<void> {
    if (this.quitar() !== n.id) { this.quitar.set(n.id); return; }
    try {
      this.notas.set(await this.sesion.esperar(this.api.borrarNota(n.id)));
      this.quitar.set(null);
      if (this.editando()?.id === n.id) this.cerrar();
      this.sesion.avisar('Nota quitada: el analista dejará de tenerla en cuenta');
      this.sesion.cargarInicio();
    } catch (e) {
      this.sesion.fallo(e);
    }
  }
}
