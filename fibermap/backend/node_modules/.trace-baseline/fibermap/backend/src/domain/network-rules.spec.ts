import { describe, expect, it } from 'vitest';
import { CABLE_FIBER_COUNTS, DEFAULT_CABLE_COLOR, cableTypeFor, defaultCableColor, defaultFiberRanges, fiberColorAt, tubeLayout } from './network-rules.js';

describe('color estándar de la fibra por cantidad de hilos', () => {
  it('2 negro, 6 rosado, 12 azul, 24 verde, 48 café', () => {
    expect(defaultCableColor(2)).toBe('#111827');
    expect(defaultCableColor(6)).toBe('#ec4899');
    expect(defaultCableColor(12)).toBe('#3b82f6');
    expect(defaultCableColor(24)).toBe('#22c55e');
    expect(defaultCableColor(48)).toBe('#8b4513');
  });

  it('todas las cantidades permitidas tienen color propio y distinto', () => {
    const colors = CABLE_FIBER_COUNTS.map(defaultCableColor);
    expect(colors).not.toContain(DEFAULT_CABLE_COLOR);
    expect(new Set(colors).size).toBe(CABLE_FIBER_COUNTS.length);
  });

  it('una cantidad desconocida cae al color por defecto', () => {
    expect(defaultCableColor(7)).toBe(DEFAULT_CABLE_COLOR);
  });

  it('solo la fibra de 2 hilos es un DROP', () => {
    expect(cableTypeFor(2)).toBe('DROP');
    expect([6, 12, 24, 48].map(cableTypeFor)).toEqual(['DISTRIBUTION', 'DISTRIBUTION', 'DISTRIBUTION', 'DISTRIBUTION']);
  });

  it('los buffers siguen las hojas de empalme: 12 = 2x6, 24 = 4x6, 48 = 4x12', () => {
    expect(tubeLayout(2)).toEqual({ fibersPerTube: 2, tubeCount: 1 });
    expect(tubeLayout(6)).toEqual({ fibersPerTube: 6, tubeCount: 1 });
    expect(tubeLayout(12)).toEqual({ fibersPerTube: 6, tubeCount: 2 });
    expect(tubeLayout(24)).toEqual({ fibersPerTube: 6, tubeCount: 4 });
    expect(tubeLayout(48)).toEqual({ fibersPerTube: 12, tubeCount: 4 });
  });

  it('el código de colores se repite dentro de cada buffer', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12, 13].map(fiberColorAt)).toEqual(
      ['BLUE', 'ORANGE', 'GREEN', 'BROWN', 'SLATE', 'WHITE', 'RED', 'AQUA', 'BLUE'],
    );
  });
});

describe('hilos por defecto de cada dispositivo de una fibra', () => {
  it('de manga a caja NAP: la NAP recibe un solo hilo', () => {
    expect(defaultFiberRanges([{ kind: 'MANGA' }, { kind: 'NAP' }], 12)).toEqual([
      { fiberFrom: 1, fiberTo: 12 },
      { fiberFrom: 1, fiberTo: 1 },
    ]);
  });

  it('de caja NAP a manga: la NAP recibe un hilo y la manga todos', () => {
    expect(defaultFiberRanges([{ kind: 'NAP' }, { kind: 'MANGA' }], 12)).toEqual([
      { fiberFrom: 1, fiberTo: 1 },
      { fiberFrom: 1, fiberTo: 12 },
    ]);
  });

  it('de manga de distribución a manga de paso: todos los hilos', () => {
    expect(defaultFiberRanges([{ kind: 'MANGA' }, { kind: 'MANGA' }], 24)).toEqual([
      { fiberFrom: 1, fiberTo: 24 },
      { fiberFrom: 1, fiberTo: 24 },
    ]);
  });

  it('si antes dejó hilos en cajas NAP, la manga siguiente solo recibe los disponibles', () => {
    expect(defaultFiberRanges([{ kind: 'MANGA' }, { kind: 'NAP' }, { kind: 'NAP' }, { kind: 'MANGA' }, { kind: 'NAP' }], 12)).toEqual([
      { fiberFrom: 1, fiberTo: 12 },
      { fiberFrom: 1, fiberTo: 1 },
      { fiberFrom: 2, fiberTo: 2 },
      { fiberFrom: 3, fiberTo: 12 },
      { fiberFrom: 3, fiberTo: 3 },
    ]);
  });

  it('respeta los rangos ya guardados y los toma en cuenta para los nuevos', () => {
    expect(defaultFiberRanges([{ kind: 'MANGA', existing: { fiberFrom: 1, fiberTo: 12 } }, { kind: 'NAP', existing: { fiberFrom: 5, fiberTo: 5 } }, { kind: 'NAP' }, { kind: 'MANGA' }], 12)).toEqual([
      { fiberFrom: 1, fiberTo: 12 },
      { fiberFrom: 5, fiberTo: 5 },
      { fiberFrom: 1, fiberTo: 1 },
      { fiberFrom: 6, fiberTo: 12 },
    ]);
  });
});


describe('capacidad de asignación de hilos', () => {
  it('rechaza una NAP adicional cuando se agotan los hilos', () => {
    expect(() => defaultFiberRanges([{ kind: 'MANGA' }, { kind: 'NAP' }, { kind: 'NAP' }, { kind: 'NAP' }], 2)).toThrow('No hay hilos disponibles');
  });
  it('rechaza continuar hacia una manga sin hilos libres', () => {
    expect(() => defaultFiberRanges([{ kind: 'MANGA' }, { kind: 'NAP' }, { kind: 'NAP' }, { kind: 'MANGA' }], 2)).toThrow('No hay hilos disponibles');
  });
  it('rechaza rangos guardados fuera de capacidad sin recortarlos', () => {
    expect(() => defaultFiberRanges([{ kind: 'NAP', existing: { fiberFrom: 1, fiberTo: 7 } }], 6)).toThrow('rango guardado');
    expect(() => defaultFiberRanges([{ kind: 'NAP', existing: { fiberFrom: 0, fiberTo: 1 } }], 6)).toThrow('rango guardado');
  });
  it('conserva los hilos guardados al insertar una NAP antes de otra', () => {
    expect(defaultFiberRanges([{ kind: 'MANGA' }, { kind: 'NAP' }, { kind: 'NAP', existing: { fiberFrom: 1, fiberTo: 1 } }], 6)).toEqual([
      { fiberFrom: 1, fiberTo: 6 }, { fiberFrom: 2, fiberTo: 2 }, { fiberFrom: 1, fiberTo: 1 },
    ]);
  });
});
