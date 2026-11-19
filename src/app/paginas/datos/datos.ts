import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { FmtPipe } from '../../nucleo/formato';
import { Campo } from '../../nucleo/tipos';

const VACIO: Campo = { tabla: '', columna: '', significado: '' };
const nombre = (c: Campo) => (c.columna ? `${c.tabla}.${c.columna}` : c.tabla);

@Component({
  selector: 'app-datos',
  imports: [FmtPipe],
  templateUrl: './datos.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatosPagina {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);
  protected readonly nombre = nombre;

  protected readonly dic = signal<Campo[] | null>(null);
  protected readonly q = signal('');
  protected readonly form = signal<Campo>({ ...VACIO });
  /** Campo que se está editando: su tabla y su columna no se pueden cambiar (se crearía otro). */
  protected readonly editando = signal<Campo | null>(null);
  protected readonly error = signal('');
  protected readonly quitar = signal<string | null>(null);

  protected readonly lista = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.dic() || []).filter(d => !q || `${d.tabla} ${d.columna} ${d.significado}`.toLowerCase().includes(q));
  });
  protected readonly documentados = computed(() => (this.dic() || []).filter(d => d.columna).length);

  constructor() {
    this.api.diccionario().then(d => this.dic.set(d), e => this.sesion.fallo(e));
  }

  protected campo(k: keyof Campo, e: Event): void {
    this.form.update(f => ({ ...f, [k]: (e.target as HTMLInputElement).value }));
    this.error.set('');
  }

  protected editar(d: Campo): void {
    this.form.set({ ...d });
    this.editando.set(d);
    this.error.set('');
    this.quitar.set(null);
    document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected cancelar(): void {
    this.form.set({ ...VACIO });
    this.editando.set(null);
    this.error.set('');
  }

  protected async guardar(): Promise<void> {
    const f = this.form();
    if (!f.tabla.trim()) return this.error.set('Indica la tabla.');
    if (f.significado.trim().length < 3) return this.error.set('Explica qué significa el campo.');
    const nuevo = !this.editando();
    // los nombres se guardan tal cual: en BigQuery los de tabla distinguen mayúsculas
    const t = f.tabla.trim(), c = f.columna.trim();
    if (nuevo && (this.dic() || []).some(d => d.tabla.toLowerCase() === t.toLowerCase() && d.columna.toLowerCase() === c.toLowerCase())) {
      return this.error.set(`${nombre({ ...f, tabla: t, columna: c })} ya está documentado: usa «Editar» en la lista.`);
    }
    try {
      this.dic.set(await this.sesion.esperar(this.api.guardarCampo(f)));
      this.cancelar();
      this.sesion.avisar('Campo guardado: el analista lo usará desde el siguiente mensaje');
      this.sesion.cargarInicio();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected async borrar(d: Campo): Promise<void> {
    if (this.quitar() !== nombre(d)) { this.quitar.set(nombre(d)); return; }
    try {
      this.dic.set(await this.sesion.esperar(this.api.borrarCampo(d)));
      this.quitar.set(null);
      if (this.editando() && nombre(this.editando()!) === nombre(d)) this.cancelar();
      this.sesion.avisar(`${nombre(d)} quitado del diccionario: el analista dejará de usarlo`);
      this.sesion.cargarInicio();
    } catch (e) {
      this.sesion.fallo(e);
    }
  }
}
