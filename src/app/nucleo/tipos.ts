// Lo que devuelve la API (backend en Python, rutas /api/*)

export type Perfil = 'revisor' | 'gestor' | 'administrador';
export type TipoRegla = 'regla_simple' | 'regla_compleja' | 'ia_razonamiento' | 'consulta';
export type Situacion = 'pendiente' | 'decidida' | 'rechazada' | 'exportada';
export type Accion = 'aceptar' | 'corregir' | 'rechazar' | 'deshacer';

export interface Yo {
  correo: string;
  perfiles: Perfil[];
  exportacion: boolean;
}

export interface Hallazgo { rule_id: string; titulo: string; tipo: TipoRegla; n: number }

export interface Inicio {
  campos: number; tablas: number; conocimiento: number; reglas: number; registros: number;
  run_id: string | null; inicio: string | null;
  casos: number; pendientes: number; por_exportar: number; rechazadas: number; exportadas: number;
  registros_con_incidencias: number;
  hallazgos: Hallazgo[];
}

// ---------------- analista ----------------
export interface Paso { n?: number; texto: string; ok: boolean }

export interface Propuesta {
  tipo: TipoRegla; titulo: string; respuesta: string;
  preguntas: string[]; supuestos: string[];
  sql: string; instruccion_ia: string;
}

export interface FilaPrueba {
  an8: number; nombre?: string; campo?: string; valor_actual?: string;
  propuesta?: string | null; motivo?: string; incumple?: boolean; justificacion?: string;
}

export interface Prueba {
  ok: boolean; error?: string;
  // regla determinista
  casos?: number; registros?: number; evaluados?: number; con_propuesta?: number;
  grupos?: { valor_actual: string; propuesta: string | null; n: number }[];
  // regla con IA
  candidatos?: number; marcados?: number;
  muestra?: FilaPrueba[];
  // consulta
  filas?: Record<string, unknown>[];
}

export interface Tokens { entrada: number; salida: number; llamadas: number }

export interface Respuesta {
  propuesta: Propuesta; prueba: Prueba | null; traza: Paso[]; tokens: Tokens; resumen: string; segundos?: number;
}

export type EstadoPeticion = 'en_curso' | 'terminada' | 'error' | 'cancelada' | 'interrumpida' | 'descartada' | 'desconocida';

export interface Mensaje {
  rol: 'usuario' | 'agente';
  texto: string;
  turno?: number;
  peticion_id?: string;
  estado?: EstadoPeticion;
  error?: string;
  propuesta?: Propuesta; prueba?: Prueba | null; traza?: Paso[]; tokens?: Tokens; resumen?: string; segundos?: number;
}

export interface ReglaBase { rule_id: string; version: number; titulo: string; tipo?: TipoRegla }

export interface Conversacion {
  conversacion_id: string;
  regla_base: ReglaBase | null;
  mensajes: Mensaje[];
  en_curso: string | null;
  /** Regla activada desde la última propuesta de la conversación, si ya se activó. */
  activada?: { rule_id: string; version: number } | null;
}

export interface ConversacionReciente {
  conversacion_id: string; inicio: string; ultima: string; primer_mensaje: string | null;
  /** Mensajes del usuario y reglas que se activaron desde la conversación. */
  mensajes?: number; reglas?: string[];
}

export interface ListaConversaciones { conversaciones: ConversacionReciente[]; hay_mas: boolean }

export interface EstadoDePeticion {
  peticion_id: string; estado: EstadoPeticion; pasos: Paso[];
  respuesta: Respuesta | null; error: string; segundos: number | null;
}

// ---------------- reglas y ejecuciones ----------------
export interface Regla {
  rule_id: string; version: number; titulo: string; tipo: TipoRegla; descripcion: string;
  sql: string; instruccion_ia: string; conversacion: string; autor: string; creada: string;
  casos: number; pendientes: number; versiones: number;
}

export interface VersionRegla { version: number; titulo: string; tipo: TipoRegla; autor: string; creada: string; retirada: string | null }

export interface EstadoEjecucion { terminada: boolean; ok: boolean | null; mensaje: string; resultado?: { casos: number; reglas: number; errores: string[] } }

// ---------------- incidencias ----------------
export interface Lote {
  run_id: string; rule_id: string; titulo: string; tipo: TipoRegla; lote: string; campo: string;
  pendientes: number; con_propuesta: number; aprobadas: number;
}

export interface FilaLote {
  an8: number; nombre: string; pais: string; campo: string; columna: string;
  valor_actual: string; propuesta: string | null; motivo: string;
}

export interface Caso {
  run_id: string; rule_id: string; titulo: string; tipo: TipoRegla; lote: string;
  an8: number; nombre: string; pais: string; campo: string; columna: string;
  valor_actual: string; propuesta: string | null; motivo: string;
  situacion: Situacion; accion: string | null; valor_decidido: string | null; motivo_decision: string | null;
  usuario_decision: string | null; fecha_decision: string | null; orden: string;
  /** Vuelve a estar pendiente porque su carga en JD Edwards dio error (mensaje del proceso de carga). */
  error_carga?: string | null;
  // solo en la pantalla
  guardando?: boolean;
  prev?: Partial<Caso>;
}

export interface Opcion { v: string; t?: string; n: number }

export interface Casos {
  total: number; quedan: number; casos: Caso[]; situacion: Situacion; por_exportar: number;
  reglas: Opcion[]; lotes: Opcion[]; paises: Opcion[];
}

export interface FiltroCasos { situacion: Situacion; rule_id: string; lote: string; pais: string; q: string }

export interface ResultadoDecision {
  rule_id: string; an8: number; columna: string; accion: Accion;
  error: string | null; situacion: Situacion; valor: string | null;
}

export interface Ficha {
  /** El cliente en la vista de clientes (null si ya no está en el maestro). */
  cliente: { nombre: string; tipo: string; estado: string; pais: string; region: string; ciudad: string } | null;
  /** Columnas de la vista, con su valor; jde = se puede corregir en JD Edwards. */
  datos: { col: string; nombre: string; ayuda: string; valor: string; jde: boolean }[];
  habitual: { v: string; n: number; pct: number }[];
  otras_incidencias: { rule_id: string; titulo: string; campo: string; columna: string; valor_actual: string; propuesta: string | null; situacion: Situacion }[];
  decisiones: { fecha: string; usuario: string; accion: string; rule_id: string; columna: string; valor: string | null; motivo: string | null }[];
  modificado: string; campo_revisado: string | null; corregible: boolean;
}

export interface Exportacion {
  exportacion_id: string; fecha: string; usuario: string; run_id: string;
  correcciones: number; retenidas: number; uri: string | null; volcadas: number; errores: number;
}

export interface ResultadoExportacion {
  exportacion_id: string | null; correcciones: number; retenidas: number; uri: string | null; error_fichero: string | null;
  retenidas_detalle: { rule_id: string; an8: number; columna: string; valor_actual: string; nuevo: string; retenida: string }[];
}

// ---------------- historial y conocimiento ----------------
export interface Actividad { fecha: string; marca: string; usuario: string; tipo: string; texto: string; detalle: string; rule_id: string }
export interface Campo { tabla: string; columna: string; significado: string }
export interface Nota { id: number; texto: string; autor: string }
