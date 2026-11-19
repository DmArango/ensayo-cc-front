import { TestBed } from '@angular/core/testing';
import { Api, ErrorApi } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';
import { Caso, Casos, ResultadoDecision } from '../../nucleo/tipos';
import { Revision } from './revision';

/** Caso de prueba: pendiente, con propuesta. */
function caso(an8: number, extra: Partial<Caso> = {}): Caso {
  return {
    run_id: 'R1', rule_id: 'AG-001', titulo: 'Regla', tipo: 'regla_simple', lote: 'L', an8, nombre: 'Cliente ' + an8,
    pais: 'ES', campo: 'Campo', columna: 'market_code', valor_actual: 'NAC', propuesta: 'EXT', motivo: 'm', situacion: 'pendiente',
    accion: null, valor_decidido: null, motivo_decision: null, usuario_decision: null, fecha_decision: null, orden: String(an8), ...extra,
  };
}

/** Promesa que se resuelve o se rechaza desde la prueba. */
function diferida<T>() {
  let resolver!: (v: T) => void, rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((a, b) => { resolver = a; rechazar = b; });
  return { promesa, resolver, rechazar };
}

const esperar = () => new Promise(r => setTimeout(r, 0));

describe('Revision · decisiones caso a caso', () => {
  let rev: Revision;
  let sesion: Sesion;
  let envios: { decisiones: any[]; d: ReturnType<typeof diferida<{ resultados: ResultadoDecision[]; por_exportar: number }>> }[];

  const resultado = (d: any, error: string | null = null): ResultadoDecision => ({
    rule_id: d.rule_id, an8: d.an8, columna: d.columna, accion: d.accion, error,
    situacion: error ? 'pendiente' : d.accion === 'rechazar' ? 'rechazada' : d.accion === 'deshacer' ? 'pendiente' : 'decidida',
    valor: error ? null : d.accion === 'aceptar' ? 'EXT' : d.valor || null,
  });

  beforeEach(() => {
    envios = [];
    const api = {
      decidir: (decisiones: any[]) => { const d = diferida<{ resultados: ResultadoDecision[]; por_exportar: number }>(); envios.push({ decisiones, d }); return d.promesa; },
      inicio: () => Promise.resolve(null),
      ficha: () => new Promise(() => {}),
      casos: () => new Promise(() => {}),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    rev = TestBed.inject(Revision);
    sesion = TestBed.inject(Sesion);
    sesion.yo.set({ correo: 'rita@acerinox.com', perfiles: ['revisor'], exportacion: true });
    const casos: Casos = { total: 3, quedan: 0, casos: [caso(1), caso(2), caso(3, { propuesta: null })], situacion: 'pendiente', por_exportar: 0,
      reglas: [], lotes: [], paises: [] };
    rev.cas.set(casos);
    rev.ci.set(0);
  });

  it('anota la decisión al momento, pasa al siguiente caso y la confirma con el servidor', async () => {
    rev.decidir('aceptar');
    const c = rev.cas()!.casos[0];
    expect(c.situacion).toBe('decidida');
    expect(c.guardando).toBe(true);
    expect(rev.ci()).toBe(1);                                   // el revisor no espera al servidor
    expect(envios.length).toBe(1);
    envios[0].d.resolver({ resultados: envios[0].decisiones.map(d => resultado(d)), por_exportar: 1 });
    await esperar();
    expect(c.guardando).toBe(false);
    expect(c.valor_decidido).toBe('EXT');
    expect(rev.porExportar()).toBe(1);
  });

  it('las decisiones tomadas mientras se guarda la anterior viajan juntas y de cada caso cuenta la última', async () => {
    rev.decidir('aceptar');                                     // caso 1: primer envío
    rev.irCaso(1);
    rev.decidir('rechazar', 'excepción acordada');              // caso 2, en cola
    rev.irCaso(1);
    rev.decidir('corregir', 'OTRO');                            // caso 2 otra vez: sustituye a la anterior
    expect(envios.length).toBe(1);
    envios[0].d.resolver({ resultados: envios[0].decisiones.map(d => resultado(d)), por_exportar: 1 });
    await esperar();
    expect(envios.length).toBe(2);
    expect(envios[1].decisiones.map(d => [d.an8, d.accion])).toEqual([[2, 'corregir']]);
  });

  it('si el servidor rechaza una decisión, el caso vuelve a como estaba y se avisa', async () => {
    rev.decidir('aceptar');
    envios[0].d.resolver({ resultados: envios[0].decisiones.map(d => resultado(d, 'El caso ya está exportado y no admite más decisiones.')), por_exportar: 0 });
    await esperar();
    const c = rev.cas()!.casos[0];
    expect(c.situacion).toBe('pendiente');
    expect(c.guardando).toBe(false);
    expect(sesion.error()).toContain('ya está exportado');
  });

  it('si falla la conexión, se deshacen las decisiones enviadas', async () => {
    rev.decidir('aceptar');
    envios[0].d.rechazar(new ErrorApi('No hay conexión con el servidor.', 0));
    await esperar();
    expect(rev.cas()!.casos[0].situacion).toBe('pendiente');
    expect(sesion.error()).toContain('No hay conexión');
  });

  it('sin propuesta, «aceptar» no se envía y avisa de cómo decidir', () => {
    rev.irCaso(2);
    rev.decidir('aceptar');
    expect(envios.length).toBe(0);
    expect(rev.form()).toBeNull();
    expect(sesion.aviso()).toContain('no tiene propuesta');
  });

  it('valida la corrección y el motivo del rechazo antes de enviar', () => {
    rev.decidir('corregir', '  ');
    expect(rev.formError()).toBe('Indica el valor correcto.');
    rev.decidir('corregir', 'NAC');
    expect(rev.formError()).toBe('Es el valor que ya tiene el maestro.');
    rev.decidir('rechazar', 'no');
    expect(rev.formError()).toBe('Indica por qué no es un error.');
    expect(envios.length).toBe(0);
  });

  it('un caso devuelto por error de carga se distingue en la lista', () => {
    expect(rev.estado(caso(9, { error_carga: 'Cliente bloqueado en JD Edwards' })).tag).toBe('Error de carga');
    expect(rev.estado(caso(9)).tag).toBe('');
  });
});
