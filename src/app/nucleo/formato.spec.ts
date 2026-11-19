import { codigos, corta, fmt, iniciales, nombreDeCorreo, pct, suave } from './formato';

describe('formato', () => {
  it('separa los miles con punto', () => {
    expect(fmt(12154)).toBe('12.154');
    expect(fmt(0)).toBe('0');
    expect(fmt(null)).toBe('0');
  });

  it('porcentaje con coma decimal', () => {
    expect(pct(667, 60077)).toBe('1,1');
    expect(pct(1, 0)).toBe('0,0');
  });

  it('nombres en mayúsculas a formato de título', () => {
    expect(suave('ACERINOX FABRICA (SIMULADA)')).toBe('Acerinox Fabrica (simulada)');
    expect(suave('NUEVA-YORK')).toBe('Nueva-York');
  });

  it('acorta textos largos', () => {
    expect(corta('Puerto de descarga', 8)).toBe('Puerto …');
    expect(corta('corto', 8)).toBe('corto');
  });

  it('lee los códigos de la explicación del diccionario', () => {
    expect(codigos('Modo de transporte: CAR = carretera, MAR = marítimo.')).toEqual({ CAR: 'carretera', MAR: 'marítimo' });
    expect(codigos('Tipo facturación: 1 = cliente del grupo, 2 = cliente externo.')).toEqual({ 1: 'cliente del grupo', 2: 'cliente externo' });
    expect(codigos('Moneda.')).toEqual({});
  });

  it('nombre y apellido del correo', () => {
    expect(nombreDeCorreo('ana.garcia@acerinox.com')).toBe('Ana Garcia');
    expect(nombreDeCorreo('maria-jose.lopez2@ext.acerinox.com')).toBe('Maria Jose Lopez');
    expect(nombreDeCorreo('rita@acerinox.com')).toBe('Rita');
    expect(nombreDeCorreo(null)).toBe('');
  });

  it('iniciales del correo', () => {
    expect(iniciales('ana.garcia@acerinox.com')).toBe('AG');
    expect(iniciales('rita@acerinox.com')).toBe('RI');
    expect(iniciales('')).toBe('··');
  });
});
