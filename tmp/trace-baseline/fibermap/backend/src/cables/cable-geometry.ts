export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocatedElement extends LatLng {
  kind: 'ODF' | 'MANGA' | 'NAP';
  id: string;
  code: string;
  name: string | null;
}

export interface SnappedPoint extends LatLng {
  element?: LocatedElement;
}

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG = 111_320;

// Proyección plana local (en metros) alrededor de un punto de referencia; para las
// distancias de decenas de metros que se comparan aquí el error es despreciable.
function projector(origin: LatLng) {
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  return (p: LatLng) => ({
    x: (p.lng - origin.lng) * METERS_PER_DEG_LNG * cos,
    y: (p.lat - origin.lat) * METERS_PER_DEG_LAT,
  });
}

export function distanceMeters(a: LatLng, b: LatLng) {
  const p = projector(a)(b);
  return Math.hypot(p.x, p.y);
}

// El candidato más cercano a `point` que está a `maxMeters` o menos, o null si no hay ninguno.
export function nearestWithin<T extends LatLng>(point: LatLng, candidates: T[], maxMeters: number): (T & { distance: number }) | null {
  let best: (T & { distance: number }) | null = null;
  for (const candidate of candidates) {
    const distance = distanceMeters(point, candidate);
    if (distance <= maxMeters && (!best || distance < best.distance)) best = { ...candidate, distance };
  }
  return best;
}

// Ajusta el trazado para que pase exactamente por el centro de cada dispositivo que el usuario
// realmente marcó: si un dispositivo está a menos de `tolerance` de un VÉRTICE (un punto que se
// clickeó o se arrastró hasta ahí), ese vértice pasa a ser su centro exacto. Un dispositivo que
// simplemente queda cerca de la LÍNEA entre dos puntos, sin que ninguno de los dos se haya
// clickeado sobre él, no se conecta: el trazado solo conecta lo que el usuario marcó con un clic
// (sobre el dispositivo o sobre un poste a su lado), nunca algo que la línea "pasa cerca" sin querer.
// Cada dispositivo aparece una sola vez, en el vértice del trazado donde queda más cerca.
export function snapPathToElements(points: LatLng[], elements: LocatedElement[], tolerance: number): SnappedPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));

  const vertexOwner = new Map<number, { element: LocatedElement; distance: number }>();

  // Los dispositivos más cercanos a un vértice tienen prioridad sobre ese vértice.
  const candidates = elements
    .map((element) => {
      let bestVertex = { index: -1, distance: Infinity };
      points.forEach((p, index) => {
        const distance = distanceMeters(element, p);
        if (distance < bestVertex.distance) bestVertex = { index, distance };
      });
      return { element, bestVertex };
    })
    .filter((c) => c.bestVertex.distance <= tolerance)
    .sort((a, b) => a.bestVertex.distance - b.bestVertex.distance);

  for (const { element, bestVertex } of candidates) {
    if (!vertexOwner.has(bestVertex.index)) {
      vertexOwner.set(bestVertex.index, { element, distance: bestVertex.distance });
    }
  }

  return points.map((point, index) => {
    const owner = vertexOwner.get(index);
    return owner ? { lat: owner.element.lat, lng: owner.element.lng, element: owner.element } : { ...point };
  });
}

export interface ConnectionPoint {
  element: LocatedElement;
  role: 'START' | 'PASS' | 'END';
  sequence: number;
}

// Un dispositivo por punto del trazado, en orden. El primero es el inicio (START) y, si el
// último punto también es un dispositivo, es el final (END); los intermedios son PASS.
export function connectionsFromPath(path: SnappedPoint[]): ConnectionPoint[] {
  const seen = new Set<string>();
  const found: { element: LocatedElement; pointIndex: number }[] = [];
  path.forEach((p, pointIndex) => {
    if (!p.element) return;
    const key = `${p.element.kind}:${p.element.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ element: p.element, pointIndex });
  });
  return found.map(({ element, pointIndex }, sequence) => ({
    element,
    sequence,
    role: pointIndex === 0 ? 'START' : pointIndex === path.length - 1 ? 'END' : 'PASS',
  }));
}
