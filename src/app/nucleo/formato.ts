import { Pipe, PipeTransform } from '@angular/core';
import { TipoRegla } from './tipos';

/** 12345 → «12.345» */
export function fmt(n: unknown): string {
  return String(Math.round(Number(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Porcentaje con una cifra decimal y coma: «12,5» */
export function pct(a: number | undefined, b: number | undefined): string {
  return (b ? ((a || 0) / b) * 100 : 0).toFixed(1).replace('.', ',');
}

export const TIPO: Record<string, string> = {
  regla_simple: 'Regla sencilla',
  regla_compleja: 'Regla compleja',
  ia_razonamiento: 'Regla con IA',
  consulta: 'Consulta de datos',
};

export const esRegla = (t: TipoRegla | string | undefined) =>
  t === 'regla_simple' || t === 'regla_compleja' || t === 'ia_razonamiento';

/** «ACERINOX EUROPA» → «Acerinox Europa» */
export function suave(t: string | null | undefined): string {
  return String(t || '').toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

export function corta(t: string | null | undefined, n: number): string {
  const s = String(t || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Qué significa cada código, sacado de la explicación del diccionario («Modo de transporte: CAR = carretera, MAR = marítimo») */
export function codigos(sig: string | null | undefined): Record<string, string> {
  const t = String(sig || '');
  const i = t.indexOf(':');
  const m: Record<string, string> = {};
  if (i < 0) return m;
  t.slice(i + 1).split(',').forEach(x => {
    const r = x.trim().match(/^([A-Z0-9]{1,4})\s+(?:=\s*)?([^.]+)/);
    if (r) m[r[1]] = r[2].trim();
  });
  return m;
}

/**
 * Nombre y apellido a partir del correo (nombre.apellido@… → «Nombre Apellido»). IAP solo entrega el
 * correo, así que no hay tildes; con un correo sin separadores se queda la parte antes de la arroba.
 */
export function nombreDeCorreo(correo: string | null | undefined): string {
  const partes = String(correo || '').split('@')[0].split(/[._-]+/).map(p => p.replace(/\d+/g, '')).filter(Boolean);
  return partes.map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

export function iniciales(correo: string | null | undefined): string {
  const nombre = String(correo || '').split('@')[0];
  const partes = nombre.split(/[._-]+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || partes[0]?.[1] || '')).toUpperCase() || '··';
}

@Pipe({ name: 'fmt' })
export class FmtPipe implements PipeTransform {
  transform(n: unknown): string {
    return fmt(n);
  }
}
