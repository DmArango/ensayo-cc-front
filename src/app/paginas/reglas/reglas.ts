import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { FmtPipe, TIPO } from '../../nucleo/formato';
import { Regla, VersionRegla } from '../../nucleo/tipos';
import { ConversacionAnalista } from '../analista/conversacion';

@Component({
  selector: 'app-reglas',
  imports: [FmtPipe],
  templateUrl: './reglas.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReglasPagina {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly conversacion = inject(ConversacionAnalista);
  protected readonly sesion = inject(Sesion);
  protected readonly TIPO = TIPO;

  protected readonly reglas = signal<Regla[] | null>(null);
  protected readonly filtro = signal<'todas' | 'det' | 'ia'>('todas');
  protected readonly sel = signal<string | null>(null);
  protected readonly confirmarRetirar = signal(false);
  /** Versiones de cada regla, pedidas al abrir «Ver versiones». */
  protected readonly versiones = signal<Record<string, VersionRegla[] | 'error'>>({});

  protected readonly lista = computed(() => (this.reglas() || []).filter(r =>
    this.filtro() === 'todas' || (this.filtro() === 'ia' ? r.tipo === 'ia_razonamiento' : r.tipo !== 'ia_razonamiento')));
  protected readonly actual = computed<Regla | null>(() => {
    const l = this.lista();
    return l.find(r => r.rule_id === this.sel()) || l[0] || null;
  });
  protected readonly conv = computed(() => {
    try { return JSON.parse(this.actual()?.conversacion || '[]') as { rol: string; texto: string }[]; } catch { return []; }
  });

  constructor() {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    try { this.reglas.set(await this.api.reglas()); } catch (e) { this.sesion.fallo(e); }
  }

  protected elegir(r: Regla): void {
    this.sel.set(r.rule_id);
    this.confirmarRetirar.set(false);
  }

  protected tecla(r: Regla, e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.elegir(r); }
  }

  protected filtrar(f: 'todas' | 'det' | 'ia'): void {
    this.filtro.set(f);
    this.sel.set(null);
  }

  protected async verVersiones(r: Regla, e: Event): Promise<void> {
    if (!(e.target as HTMLDetailsElement).open || this.versiones()[r.rule_id]) return;
    try {
      const v = await this.api.versiones(r.rule_id);
      this.versiones.update(x => ({ ...x, [r.rule_id]: v }));
    } catch {
      this.versiones.update(x => ({ ...x, [r.rule_id]: 'error' }));
    }
  }

  protected listaVersiones(id: string): VersionRegla[] | null {
    const v = this.versiones()[id];
    return Array.isArray(v) ? v : null;
  }

  protected nueva(): void {
    this.conversacion.nueva();
    this.router.navigate(['/analista']);
  }

  protected modificar(r: Regla): void {
    this.conversacion.nueva({ rule_id: r.rule_id, version: r.version, titulo: r.titulo, tipo: r.tipo });
    this.router.navigate(['/analista']);
  }

  protected async retirar(r: Regla): Promise<void> {
    if (!this.confirmarRetirar()) { this.confirmarRetirar.set(true); return; }
    try {
      await this.sesion.esperar(this.api.retirarRegla(r.rule_id));
      this.sesion.avisar(`Regla ${r.rule_id} retirada: sus casos ya no se revisan ni se exportan`);
      this.sel.set(null);
      this.confirmarRetirar.set(false);
      await this.cargar();
      this.sesion.cargarInicio();
    } catch (e) {
      this.sesion.fallo(e);
    }
  }
}
