import { BadRequestException } from '@nestjs/common';

// Reglas de la red FTTH de FiberMap. Son los únicos tipos de elemento que existen:
// ODF, Fibra, Manga y Caja NAP (el splitter es un componente interno de mangas de
// distribución y cajas NAP, no un elemento independiente en el mapa).

export const FIBER_COUNTS = [6, 12, 24, 48] as const;

export const BOX_TYPES = ['NAP', 'MANGA'] as const;

export const MANGA_TYPES = ['DISTRIBUCION', 'DISTRIBUCION_NORMAL', 'PASO', 'EMPALME'] as const;

export const SPLITTER_RATIOS = ['1:8', '1:16'] as const;

// Un splitter primario (en manga de distribución) siempre es 1:8; el secundario (dentro de
// la caja NAP) puede ser 1:8 o 1:16.
export const MANGA_SPLITTER_RATIO = '1:8';

export const NAP_SPLITTER_RATIOS: readonly string[] = ['1:8', '1:16'];

// Una caja NAP suma como máximo 16 salidas de splitter: un 1:16, o uno o dos 1:8 (nunca 1:16 + 1:8).
export const NAP_MAX_SPLITTER_OUTPUTS = 16;

export const splitterOutputs = (ratio: string) => Number(ratio.split(':')[1]);

// Buffers (tubos) de la fibra como en las hojas de empalme: hasta 24 hilos van de 6 en 6
// (12 = 2 buffers, 24 = 4 buffers) y la de 48 lleva 4 buffers de 12. El drop de 2 hilos es un solo buffer.
export const tubeLayout = (fiberCount: number) => {
  const fibersPerTube = fiberCount >= 48 ? 12 : Math.min(fiberCount, 6);
  return { fibersPerTube, tubeCount: Math.ceil(fiberCount / fibersPerTube) };
};

// Código de 12 colores: es el color de los hilos dentro de cada buffer y también el de los buffers
// (buffer 1 azul, buffer 2 naranja, buffer 3 verde, buffer 4 café...).
export const FIBER_COLOR_CODE = [
  'BLUE', 'ORANGE', 'GREEN', 'BROWN', 'SLATE', 'WHITE',
  'RED', 'BLACK', 'YELLOW', 'VIOLET', 'PINK', 'AQUA',
] as const;

export const fiberColorAt = (position: number) => FIBER_COLOR_CODE[(position - 1) % FIBER_COLOR_CODE.length];

// --- Conexión automática de fibras con dispositivos ---

// Una fibra se conecta a un dispositivo (ODF, manga o caja NAP) solo si tiene un VÉRTICE en su centro
// exacto, es decir, si el usuario hizo clic sobre él (el mapa manda el centro exacto del dispositivo).
// La tolerancia solo absorbe el redondeo de las coordenadas: un vértice puesto sobre un poste, aunque
// quede cerca de un dispositivo, NO se conecta a él, y una línea que pasa cerca tampoco.
export const CENTER_TOLERANCE_METERS = 2;

// --- Los postes importados (KMZ) son la base del trazado ---

// Cada punto de una fibra va sobre un poste (o en el centro de un ODF, manga o caja NAP). El mapa
// imanta el clic al poste; esta tolerancia solo absorbe el redondeo de las coordenadas.
export const POLE_VERTEX_TOLERANCE_METERS = 2;

// Una caja NAP va sobre un poste o a un lado, muy cerca.
export const NAP_POLE_TOLERANCE_METERS = 5;

export const CABLE_CONNECTION_TYPES = ['SPLICE', 'CONNECTOR', 'PATCH', 'DIRECT'] as const;

export const DEFAULT_CABLE_COLOR = '#ef4444';

// Una fibra puede ser un drop de 2 hilos o una troncal de 6, 12, 24 o 48 hilos. (Las mangas
// siguen manejando solo 6, 12, 24 o 48: ver FIBER_COUNTS.)
export const CABLE_FIBER_COUNTS = [2, 6, 12, 24, 48] as const;

// Color estándar de la fibra según su cantidad de hilos: 2 negro (DROP), 6 rosado, 12 azul,
// 24 verde, 48 café. Solo es el valor por defecto: el usuario puede elegir otro color.
export const FIBER_COLOR_BY_COUNT: Record<number, string> = {
  2: '#111827',
  6: '#ec4899',
  12: '#3b82f6',
  24: '#22c55e',
  48: '#8b4513',
};

// Clasificación interna de la fibra: la de 2 hilos es un DROP (acometida al cliente); el resto son
// tramos de distribución.
export const cableTypeFor = (fiberCount: number) => (fiberCount === 2 ? 'DROP' : 'DISTRIBUTION');

export const defaultCableColor = (fiberCount: number) => FIBER_COLOR_BY_COUNT[fiberCount] ?? DEFAULT_CABLE_COLOR;

// Configuración con la que nace toda conexión; se puede cambiar después.
export const DEFAULT_CABLE_CONNECTION = {
  connectionType: 'SPLICE',
  lossDb: 0.1,
} as const;

// --- Hilos que le tocan a cada dispositivo de una fibra ---

export interface FiberStop {
  kind: 'ODF' | 'MANGA' | 'NAP';
  // Rango ya guardado (conexión que ya existía): se respeta tal cual.
  existing?: { fiberFrom: number; fiberTo: number };
}

// Rango de hilos por defecto de cada dispositivo que toca una fibra, en el orden del trazado:
// - Una caja NAP recibe un solo hilo: el primero que ninguna NAP anterior de esta fibra tomó.
// - Un ODF o una manga reciben todos los hilos, salvo que la fibra venga de un ODF o una manga y
//   antes haya dejado hilos en cajas NAP: entonces solo recibe los hilos que quedan disponibles
//   (el tramo continuo más largo de hilos libres, porque la conexión guarda un rango).
export function defaultFiberRanges(stops: FiberStop[], fiberCount: number) {
  if (!CABLE_FIBER_COUNTS.includes(fiberCount as typeof CABLE_FIBER_COUNTS[number])) throw new BadRequestException('Cantidad de hilos no permitida');
  for (const stop of stops) {
    const r = stop.existing;
    if (r && (!Number.isInteger(r.fiberFrom) || !Number.isInteger(r.fiberTo) || r.fiberFrom < 1 || r.fiberTo < r.fiberFrom || r.fiberTo > fiberCount)) {
      throw new BadRequestException('El rango guardado está fuera de la capacidad de la fibra');
    }
  }
  // Reservar primero los rangos existentes, incluso los situados después de una nueva NAP.
  const reserved = new Set<number>();
  for (const stop of stops) if (stop.kind === 'NAP' && stop.existing) {
    for (let n = stop.existing.fiberFrom; n <= stop.existing.fiberTo; n++) reserved.add(n);
  }
  const dropped = new Set<number>();
  let fedFromUpstream = false;
  return stops.map((stop, index) => {
    let range: { fiberFrom: number; fiberTo: number };
    if (stop.existing) {
      range = { ...stop.existing };
    } else if (stop.kind === 'NAP') {
      const free = Array.from({ length: fiberCount }, (_, i) => i + 1).find((n) => !dropped.has(n) && !reserved.has(n));
      if (free === undefined) throw new BadRequestException('No hay hilos disponibles para otra caja NAP');
      range = { fiberFrom: free, fiberTo: free };
    } else if (index > 0 && fedFromUpstream && dropped.size > 0) {
      const available = longestFreeRun(dropped, fiberCount);
      if (!available) throw new BadRequestException('No hay hilos disponibles para continuar hacia la manga u ODF');
      range = available;
    } else {
      range = { fiberFrom: 1, fiberTo: fiberCount };
    }
    if (stop.kind === 'NAP') {
      for (let n = range.fiberFrom; n <= range.fiberTo; n++) dropped.add(n);
    } else {
      fedFromUpstream = true;
    }
    return range;
  });
}

function longestFreeRun(taken: Set<number>, fiberCount: number) {
  let best: { fiberFrom: number; fiberTo: number } | null = null;
  let start: number | null = null;
  for (let n = 1; n <= fiberCount + 1; n++) {
    const free = n <= fiberCount && !taken.has(n);
    if (free && start === null) start = n;
    if (!free && start !== null) {
      if (!best || n - start > best.fiberTo - best.fiberFrom + 1) best = { fiberFrom: start, fiberTo: n - 1 };
      start = null;
    }
  }
  return best;
}

export const isNormalManga = (type?: string | null) => ['DISTRIBUCION_NORMAL', 'PASO', 'EMPALME'].includes(type ?? '');
