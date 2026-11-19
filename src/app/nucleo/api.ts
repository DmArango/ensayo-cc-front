import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import {
  Actividad, Campo, Casos, Conversacion, EstadoDePeticion, ListaConversaciones, EstadoEjecucion, Exportacion, Ficha,
  FilaLote, FiltroCasos, Inicio, Lote, Nota, Regla, ReglaBase, ResultadoDecision, ResultadoExportacion, VersionRegla, Yo,
} from './tipos';

/** Error de la API con el texto para el usuario y el estado HTTP. */
export class ErrorApi extends Error {
  constructor(message: string, readonly estado: number) {
    super(message);
  }
}

function aErrorApi(e: unknown): ErrorApi {
  if (e instanceof HttpErrorResponse) {
    const detalle = e.error && typeof e.error === 'object' ? (e.error as { detail?: unknown }).detail : null;
    if (e.status === 0) return new ErrorApi('No hay conexión con el servidor. Comprueba la red y vuelve a intentarlo.', 0);
    // 401: la sesión ha caducado o el servicio no está bien configurado; el servidor dice cuál
    if (e.status === 401) {
      return new ErrorApi(typeof detalle === 'string' && detalle
        ? `No se ha podido comprobar tu identidad: ${detalle} Recarga la página; si se repite, avisa al equipo técnico.`
        : 'Tu sesión ha caducado. Recarga la página para volver a entrar.', 401);
    }
    if (typeof detalle === 'string' && detalle) return new ErrorApi(detalle, e.status);
    if (e.status >= 502 && e.status <= 504) return new ErrorApi('El servidor no responde ahora mismo. Vuelve a intentarlo en un momento.', e.status);
    return new ErrorApi('Ha habido un error en el servidor. Vuelve a intentarlo.', e.status);
  }
  return new ErrorApi(e instanceof Error ? e.message : String(e), -1);
}

const BASE = '/api';

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private async pedir<T>(o: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(o);
    } catch (e) {
      throw aErrorApi(e);
    }
  }
  private get<T>(ruta: string, params?: Record<string, string | number>) {
    return this.pedir(this.http.get<T>(BASE + ruta, { params: new HttpParams({ fromObject: params || {} }) }));
  }
  private post<T>(ruta: string, cuerpo: unknown = {}) {
    return this.pedir(this.http.post<T>(BASE + ruta, cuerpo));
  }

  // generales
  yo() { return this.get<Yo>('/yo'); }
  inicio() { return this.get<Inicio>('/inicio'); }

  // analista
  enviarMensaje(texto: string, turno: number, conversacion_id: string | null, regla_base: ReglaBase | null) {
    return this.post<{ conversacion_id: string; peticion_id: string }>('/analista/mensajes',
      { texto, turno, conversacion_id, regla_base: regla_base ? { rule_id: regla_base.rule_id } : null });
  }
  estadoPeticion(peticion_id: string, conversacion_id: string, desde: number) {
    return this.get<EstadoDePeticion>(`/analista/peticiones/${encodeURIComponent(peticion_id)}`, { conversacion_id, desde });
  }
  cancelarPeticion(peticion_id: string, conversacion_id: string) {
    return this.post<{ estado: string }>(`/analista/peticiones/${encodeURIComponent(peticion_id)}/cancelar`, { conversacion_id });
  }
  /** Conversaciones del usuario (último año), con búsqueda en sus mensajes. `antes`: la `ultima` de la última recibida. */
  conversaciones(q = '', antes = '', limite = 30) {
    return this.get<ListaConversaciones>('/analista/conversaciones', { q, antes, limite });
  }
  conversacion(id: string) { return this.get<Conversacion>(`/analista/conversaciones/${encodeURIComponent(id)}`); }

  // reglas y ejecuciones
  reglas() { return this.get<Regla[]>('/reglas'); }
  versiones(rule_id: string) { return this.get<VersionRegla[]>(`/reglas/${encodeURIComponent(rule_id)}/versiones`); }
  activarRegla(conversacion_id: string, rule_id_base: string) {
    return this.post<{ rule_id: string; version: number }>('/reglas', { conversacion_id, rule_id_base });
  }
  retirarRegla(rule_id: string) { return this.post<{ rule_id: string }>(`/reglas/${encodeURIComponent(rule_id)}/retirar`); }
  ejecutar() { return this.post<{ ejecucion: string }>('/ejecuciones'); }
  estadoEjecucion(nombre: string) { return this.get<EstadoEjecucion>('/ejecuciones/estado', { nombre }); }

  // incidencias
  lotes() { return this.get<Lote[]>('/lotes'); }
  muestraLote(l: Lote) { return this.get<FilaLote[]>('/lotes/muestra', { run_id: l.run_id, rule_id: l.rule_id, lote: l.lote }); }
  aceptarLote(l: Lote, excluidos: string[]) {
    return this.post<{ aceptados: number }>('/lotes/aceptar', { run_id: l.run_id, rule_id: l.rule_id, lote: l.lote, excluidos });
  }
  casos(f: FiltroCasos, despues: string) { return this.get<Casos>('/casos', { ...f, despues }); }
  ficha(c: { an8: number; rule_id: string; columna: string }) {
    return this.get<Ficha>('/ficha', { an8: c.an8, rule_id: c.rule_id, columna: c.columna || '' });
  }
  decidir(decisiones: unknown[]) {
    return this.post<{ resultados: ResultadoDecision[]; por_exportar: number }>('/decisiones', { decisiones });
  }
  exportaciones() { return this.get<Exportacion[]>('/exportaciones'); }
  exportar() { return this.post<ResultadoExportacion>('/exportaciones'); }
  escribirFichero(id: string) { return this.post<{ exportacion_id: string; uri: string }>(`/exportaciones/${encodeURIComponent(id)}/fichero`); }
  urlCsv(id: string) { return `${BASE}/exportaciones/${encodeURIComponent(id)}/csv`; }

  // historial y conocimiento
  historial(tipo: string, antes: string) {
    return this.get<{ actividad: Actividad[]; hay_mas: boolean }>('/historial', { tipo: tipo === 'todo' ? '' : tipo, antes });
  }
  diccionario() { return this.get<Campo[]>('/diccionario'); }
  guardarCampo(c: Campo) { return this.pedir(this.http.put<Campo[]>(BASE + '/diccionario', c)); }
  borrarCampo(c: Campo) {
    return this.pedir(this.http.delete<Campo[]>(BASE + '/diccionario', { params: new HttpParams({ fromObject: { tabla: c.tabla, columna: c.columna || '' } }) }));
  }
  conocimiento() { return this.get<Nota[]>('/conocimiento'); }
  guardarNota(texto: string) { return this.post<Nota[]>('/conocimiento', { texto }); }
  editarNota(id: number, texto: string) { return this.pedir(this.http.put<Nota[]>(`${BASE}/conocimiento/${id}`, { texto })); }
  borrarNota(id: number) { return this.pedir(this.http.delete<Nota[]>(`${BASE}/conocimiento/${id}`)); }
}
