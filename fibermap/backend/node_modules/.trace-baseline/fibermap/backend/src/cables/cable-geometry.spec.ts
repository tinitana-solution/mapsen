import { describe, expect, it } from 'vitest';
import { connectionsFromPath, distanceMeters, nearestWithin, snapPathToElements, type LocatedElement } from './cable-geometry.js';

// ~111 m por 0.001° de latitud; se usan desplazamientos pequeños para controlar metros.
const M = 1 / 110_540;
const el = (id: string, kind: LocatedElement['kind'], lat: number, lng: number): LocatedElement => ({ id, kind, code: id, name: id, lat, lng });

describe('snapPathToElements', () => {
  const odf = el('ODF-1', 'ODF', 0, 0);
  const nap = el('NAP-1', 'NAP', 100 * M, 0);

  it('mueve un vértice cercano al centro exacto del dispositivo', () => {
    const path = snapPathToElements([{ lat: 3 * M, lng: 0 }, { lat: 100 * M + 2 * M, lng: 0 }], [odf, nap], 10);
    expect(path[0]).toMatchObject({ lat: 0, lng: 0, element: odf });
    expect(path[1]).toMatchObject({ lat: nap.lat, lng: nap.lng, element: nap });
  });

  it('NO conecta un dispositivo que solo queda cerca de la línea entre dos puntos (nadie hizo clic ahí)', () => {
    // MAN-1 está a solo 4 m de la línea recta entre los dos puntos, pero ninguno de los dos puntos
    // es un clic sobre ella: el trazado solo conecta lo que el usuario marcó, no lo que la línea
    // simplemente "pasa cerca".
    const mid = el('MAN-1', 'MANGA', 50 * M, 4 * M);
    const path = snapPathToElements([{ lat: 0, lng: 0 }, { lat: 100 * M, lng: 0 }], [odf, mid, nap], 10);
    expect(path.map((p) => p.element?.id ?? '-')).toEqual(['ODF-1', 'NAP-1']);
  });

  it('conecta un dispositivo solo si hay un vértice (un punto del trazado) cerca de él', () => {
    const a = el('A', 'MANGA', 70 * M, 0);
    const b = el('B', 'MANGA', 30 * M, 0);
    // Un vértice explícito en (30·M, 0) sí cuenta como "clic sobre B"; A no tiene ningún vértice
    // cerca (solo queda cerca de la línea), así que no se conecta.
    const path = snapPathToElements([{ lat: 0, lng: 0 }, { lat: 30 * M, lng: 0 }, { lat: 100 * M, lng: 0 }], [a, b], 10);
    expect(path.map((p) => p.element?.id ?? '-')).toEqual(['-', 'B', '-']);
  });

  it('ignora dispositivos lejos de todos los vértices', () => {
    const far = el('FAR', 'NAP', 50 * M, 60 * M);
    const path = snapPathToElements([{ lat: 0, lng: 0 }, { lat: 100 * M, lng: 0 }], [far], 10);
    expect(path).toHaveLength(2);
    expect(path.every((p) => !p.element)).toBe(true);
  });
});

describe('connectionsFromPath', () => {
  it('asigna START, PASS y END y no repite dispositivos', () => {
    const a = el('A', 'ODF', 0, 0);
    const b = el('B', 'MANGA', 0.001, 0);
    const c = el('C', 'NAP', 0.002, 0);
    const path = [
      { lat: a.lat, lng: a.lng, element: a },
      { lat: b.lat, lng: b.lng, element: b },
      { lat: 0.0015, lng: 0 },
      { lat: c.lat, lng: c.lng, element: c },
    ];
    expect(connectionsFromPath(path).map((c) => [c.element.id, c.role, c.sequence])).toEqual([
      ['A', 'START', 0],
      ['B', 'PASS', 1],
      ['C', 'END', 2],
    ]);
  });

  it('un trazado que termina en un punto libre no tiene END', () => {
    const a = el('A', 'ODF', 0, 0);
    const path = [{ lat: 0, lng: 0, element: a }, { lat: 0.001, lng: 0 }];
    expect(connectionsFromPath(path).map((c) => c.role)).toEqual(['START']);
  });
});

describe('distanceMeters', () => {
  it('mide metros en un eje', () => {
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 100 * M, lng: 0 })).toBeCloseTo(100, 0);
  });
});

describe('nearestWithin', () => {
  const poles = [{ lat: 0, lng: 0, id: 'a' }, { lat: 3 * M, lng: 0, id: 'b' }, { lat: 50 * M, lng: 0, id: 'c' }];

  it('devuelve el candidato más cercano dentro del radio', () => {
    expect(nearestWithin({ lat: 2 * M, lng: 0 }, poles, 5)?.id).toBe('b');
  });

  it('devuelve null si nada está dentro del radio', () => {
    expect(nearestWithin({ lat: 20 * M, lng: 0 }, poles, 5)).toBeNull();
    expect(nearestWithin({ lat: 0, lng: 0 }, [], 5)).toBeNull();
  });
});
