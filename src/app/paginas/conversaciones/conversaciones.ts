import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { ConversacionAnalista } from '../analista/conversacion';
import { ConversacionReciente } from '../../nucleo/tipos';

const DIA = 86_400_000;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** En qué grupo de fecha va una conversación, según su último mensaje (como en cualquier chat). */
function grupo(iso: string, hoy: Date): string {
  const d = new Date(iso);
  const dias = Math.floor((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DIA);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return 'Últimos 7 días';
  if (dias < 30) return 'Últimos 30 días';
  return `${MESES[d.getMonth()][0].toUpperCase() + MESES[d.getMonth()].slice(1)} de ${d.getFullYear()}`;
}

/**
 * Todas las conversaciones del usuario con el analista (último año), agrupadas por fecha, con búsqueda
 * en sus mensajes y las reglas que se activaron desde cada una. Al abrir una, se sigue en el analista.
 */
@Component({
  selector: 'app-conversaciones',
  templateUrl: './conversaciones.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversacionesPagina {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly sesion = inject(Sesion);
  protected readonly c = inject(ConversacionAnalista);

  protected readonly lista = signal<ConversacionReciente[] | null>(null);
  protected readonly hayMas = signal(false);
  protected readonly cargandoMas = signal(false);
  protected readonly q = signal('');
  private tBusca?: ReturnType<typeof setTimeout>;
  private tk = 0;

  protected readonly grupos = computed(() => {
    const hoy = new Date(), out: { t: string; l: ConversacionReciente[] }[] = [];
    for (const x of this.lista() || []) {
      const t = grupo(x.ultima, hoy);
      if (out.at(-1)?.t === t) out.at(-1)!.l.push(x); else out.push({ t, l: [x] });
    }
    return out;
  });

  constructor() {
    this.cargar();
  }

  protected async cargar(mas = false): Promise<void> {
    const tk = ++this.tk, previa = mas ? this.lista() || [] : [];
    if (mas) this.cargandoMas.set(true); else this.lista.set(null);
    try {
      const r = await this.api.conversaciones(this.q(), mas ? previa.at(-1)?.ultima || '' : '');
      if (tk !== this.tk) return;
      this.lista.set(previa.concat(r.conversaciones));
      this.hayMas.set(r.hay_mas);
    } catch (e) {
      if (tk === this.tk) { this.lista.set(previa); this.sesion.fallo(e); }
    } finally {
      if (tk === this.tk) this.cargandoMas.set(false);
    }
  }

  protected buscar(e: Event, ya = false): void {
    const q = (e.target as HTMLInputElement).value.trim();
    clearTimeout(this.tBusca);
    this.tBusca = setTimeout(() => { if (q !== this.q()) { this.q.set(q); this.cargar(); } }, ya ? 0 : 400);
  }

  protected abrir(id: string): void {
    this.router.navigate(['/analista'], { queryParams: { conversacion: id } });
  }

  protected nueva(): void {
    this.c.nueva();
    this.router.navigate(['/analista']);
  }

  protected cuando(iso: string): string {
    const d = new Date(iso), hoy = new Date();
    if (isNaN(d.getTime())) return '';
    const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return grupo(iso, hoy) === 'Hoy' ? hora : `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}, ${hora}`;
  }
}
