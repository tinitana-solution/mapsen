import { apiFetch } from './api';

// Los únicos elementos de la red son ODF, Manga y Caja NAP (puntos en el mapa) y la
// Fibra (línea). El splitter es un componente interno de mangas de distribución y cajas NAP.
export type ElementKind = 'ODF' | 'MANGA' | 'NAP';

export const ELEMENT_KINDS: ElementKind[] = ['ODF', 'MANGA', 'NAP'];

export const ELEMENT_LABELS: Record<ElementKind, string> = {
  ODF: 'ODF',
  MANGA: 'Manga',
  NAP: 'Caja NAP',
};

export const ELEMENT_HELP: Record<ElementKind, string> = {
  ODF: 'Donde empieza y termina la red.',
  MANGA: 'Ramificación de la fibra. Puede ser de distribución, de paso o de empalme.',
  NAP: 'Caja con splitter secundario (1:8 o 1:16) que entrega la señal a las ONU.',
};

// Cantidades de hilos de una manga.
export const FIBER_COUNTS = [6, 12, 24, 48];

// Cantidades de hilos de una fibra: un drop de 2 o una troncal de 6, 12, 24 o 48.
export const CABLE_FIBER_COUNTS = [2, 6, 12, 24, 48];

export const fiberCountLabel = (count: number) => (count === 2 ? '2 hilos (DROP)' : `${count} hilos`);

export const MANGA_TYPES = [
  { value: 'DISTRIBUCION', label: 'Distribución', help: 'Reparte la señal de nodo a nodo y hacia las cajas NAP, con splitters primarios 1:8.' },
  { value: 'PASO', label: 'De paso', help: 'Solo pasa la fibra de un nodo a otro, sin dividir la señal.' },
  { value: 'EMPALME', label: 'De empalme', help: 'Puede ubicarse fuera de los postes y conectar hilos del mismo número entre una entrada y una salida.' },
];

export const MANGA_TYPE_LABELS: Record<string, string> = Object.fromEntries(MANGA_TYPES.map((t) => [t.value, t.label]));

export const NAP_SPLITTER_RATIOS = ['1:8', '1:16'];

export const ODF_CAPACITIES = [12, 24, 48, 72, 96, 144];

export const MANGA_COLORS: Record<string, string> = {
  DISTRIBUCION: '#a855f7',
  PASO: '#0ea5e9',
  EMPALME: '#f59e0b',
};

export const ELEMENT_COLORS: Record<Exclude<ElementKind, 'MANGA'>, string> = {
  ODF: '#6366f1',
  NAP: '#10b981',
};

export const FIBER_COLOR = '#ef4444';

// Color estándar según la cantidad de hilos (igual que en el backend): 2 negro (DROP),
// 6 rosado, 12 azul, 24 verde, 48 café. Es solo el valor por defecto; se puede cambiar.
export const FIBER_COLOR_BY_COUNT: Record<number, { value: string; name: string }> = {
  2: { value: '#111827', name: 'Negro' },
  6: { value: '#ec4899', name: 'Rosado' },
  12: { value: '#3b82f6', name: 'Azul' },
  24: { value: '#22c55e', name: 'Verde' },
  48: { value: '#8b4513', name: 'Café' },
};

export const defaultFiberColor = (fiberCount: number) => FIBER_COLOR_BY_COUNT[fiberCount]?.value ?? FIBER_COLOR;

export const ELEMENT_PATH: Record<ElementKind, string> = {
  ODF: '/odfs',
  MANGA: '/boxes',
  NAP: '/boxes',
};

export interface NetworkElement {
  kind: ElementKind;
  id: string;
  code: string;
  name: string;
  status: string;
  lat: number;
  lng: number;
  raw: any;
}

export function toElement(kind: ElementKind, raw: any): NetworkElement {
  return {
    kind,
    id: raw.id,
    code: raw.code,
    name: raw.name ?? raw.code,
    status: raw.status ?? 'ACTIVE',
    lat: Number(raw.latitude),
    lng: Number(raw.longitude),
    raw,
  };
}

export const boxKind = (box: { type: string }): ElementKind => (box.type === 'MANGA' ? 'MANGA' : 'NAP');

export function elementColor(el: Pick<NetworkElement, 'kind' | 'raw'>): string {
  return el.kind === 'MANGA' ? (MANGA_COLORS[el.raw?.mangaType] ?? MANGA_COLORS.PASO) : ELEMENT_COLORS[el.kind];
}

// Una caja o manga "tiene interior" (puertos, splitters, fusiones) y se abre en el editor.
export const hasInterior = (el: Pick<NetworkElement, 'kind'>) => el.kind === 'MANGA' || el.kind === 'NAP';

// Texto corto que resume lo más importante de cada elemento.
export function describeElement(el: NetworkElement): string {
  const { raw } = el;
  switch (el.kind) {
    case 'ODF':
      return `${raw.capacity ?? 0} puertos`;
    case 'MANGA':
      return `${MANGA_TYPE_LABELS[raw.mangaType] ?? 'Manga'} · ${raw.capacity ?? '—'} hilos`;
    case 'NAP': {
      const ratio = raw.splitters?.[0]?.ratio;
      return ratio ? `Splitter ${ratio}` : 'Sin splitter interno';
    }
  }
}

function errorMessage(body: any, fallback: string): string {
  if (!body?.message) return fallback;
  return Array.isArray(body.message) ? body.message.join('. ') : String(body.message);
}

export async function readJson(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(body, fallback));
  return body;
}

export async function fetchElements(): Promise<NetworkElement[]> {
  const [odfs, boxes] = await Promise.all(
    ['/odfs', '/boxes'].map((path) => apiFetch(path).then((res) => readJson(res, 'No se pudo cargar la red'))),
  );
  return [
    ...odfs.map((o: any) => toElement('ODF', o)),
    ...boxes.map((b: any) => toElement(boxKind(b), b)),
  ];
}

export interface NewElementValues {
  name: string;
  latitude: number;
  longitude: number;
  capacity?: number;
  mangaType?: string;
  splitterRatio?: string;
}

export async function createElement(kind: ElementKind, v: NewElementValues): Promise<NetworkElement> {
  let path = ELEMENT_PATH[kind];
  let body: Record<string, unknown>;
  switch (kind) {
    case 'ODF':
      body = { name: v.name, latitude: v.latitude, longitude: v.longitude, capacity: v.capacity };
      break;
    case 'MANGA':
      body = { name: v.name, type: 'MANGA', mangaType: v.mangaType, capacity: v.capacity, lat: v.latitude, lng: v.longitude };
      break;
    case 'NAP':
      body = { name: v.name, type: 'NAP', splitterRatio: v.splitterRatio, lat: v.latitude, lng: v.longitude };
      break;
  }
  const raw = await readJson(await apiFetch(path, { method: 'POST', body: JSON.stringify(body) }), `No se pudo crear ${ELEMENT_LABELS[kind]}`);
  return toElement(kind, raw);
}

export async function updateElement(el: NetworkElement, v: Record<string, any>): Promise<NetworkElement> {
  const latitude = Number(v.latitude);
  const longitude = Number(v.longitude);
  if (v.latitude === '' || v.longitude === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('La latitud y la longitud deben ser números válidos.');
  }
  const common = { name: v.name, status: v.status, latitude, longitude };
  let body: Record<string, unknown> = common;
  if (el.kind === 'MANGA') body = { ...common, mangaType: v.mangaType, capacity: Number(v.capacity) };
  const raw = await readJson(
    await apiFetch(`${ELEMENT_PATH[el.kind]}/${el.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    `No se pudo actualizar ${ELEMENT_LABELS[el.kind]}`,
  );
  return toElement(el.kind, { ...el.raw, ...raw });
}

export async function deleteElement(el: NetworkElement): Promise<void> {
  await readJson(await apiFetch(`${ELEMENT_PATH[el.kind]}/${el.id}`, { method: 'DELETE' }), `No se pudo eliminar ${ELEMENT_LABELS[el.kind]}`);
}

export interface DeviceConnection {
  id: string;
  sequence: number;
  role: 'START' | 'PASS' | 'END';
  connectionType: string;
  fiberFrom: number;
  fiberTo: number;
  lossDb: number | null;
  notes: string | null;
  // null cuando el dispositivo fue eliminado después de conectarse
  element: { kind: ElementKind; id: string; code: string; name: string | null; lat: number; lng: number } | null;
}

export interface FiberRecord {
  id: string;
  code: string;
  name: string | null;
  fiberCount: number;
  status: string;
  color?: string;
  calculatedLengthMeters: string | number | null;
  path: { lat: number; lng: number }[];
  deviceConnections?: DeviceConnection[];
}

// Colores sugeridos para distinguir fibras en el mapa (también se puede elegir cualquier otro).
export const FIBER_COLOR_PRESETS = [
  { value: '#ef4444', label: 'Rojo' },
  { value: '#f97316', label: 'Naranja' },
  { value: '#eab308', label: 'Amarillo' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#06b6d4', label: 'Celeste' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#a855f7', label: 'Violeta' },
  { value: '#ec4899', label: 'Rosado' },
  { value: '#8b4513', label: 'Café' },
  { value: '#111827', label: 'Negro' },
];

export const CONNECTION_TYPES = [
  { value: 'SPLICE', label: 'Fusión' },
  { value: 'CONNECTOR', label: 'Conector' },
  { value: 'PATCH', label: 'Patch cord' },
  { value: 'DIRECT', label: 'Directa' },
];
export const CONNECTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(CONNECTION_TYPES.map((t) => [t.value, t.label]));

export const CONNECTION_ROLE_LABELS: Record<string, string> = { START: 'Inicio', PASS: 'Paso', END: 'Final' };

export const cableColor = (cable: Pick<FiberRecord, 'color' | 'fiberCount'>) => cable.color ?? defaultFiberColor(cable.fiberCount);

export const connectionSummary = (c: DeviceConnection) =>
  `${CONNECTION_TYPE_LABELS[c.connectionType] ?? c.connectionType} · hilos ${c.fiberFrom}-${c.fiberTo}${c.lossDb != null ? ` · ${c.lossDb} dB` : ''}`;

export const fiberWidth = (fiberCount: number) => ({ 2: 2, 6: 2, 12: 3, 24: 4, 48: 5 }[fiberCount] ?? 3);

export interface EditField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
}

export function elementEditFields(el: NetworkElement): EditField[] {
  const statuses = ['ACTIVE', 'INACTIVE'].map((v) => ({ value: v, label: v }));
  const fields: EditField[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'status', label: 'Estado', type: 'select', options: statuses },
  ];
  if (el.kind === 'MANGA') {
    fields.push(
      { key: 'mangaType', label: 'Tipo de manga', type: 'select', options: MANGA_TYPES.map((t) => ({ value: t.value, label: t.label })) },
      { key: 'capacity', label: 'Hilos', type: 'select', options: FIBER_COUNTS.map((c) => ({ value: String(c), label: `${c} hilos` })) },
    );
  }
  fields.push({ key: 'latitude', label: 'Latitud', type: 'number' }, { key: 'longitude', label: 'Longitud', type: 'number' });
  return fields;
}

export const elementEditValues = (el: NetworkElement) => ({
  ...el.raw,
  capacity: el.raw.capacity != null ? String(el.raw.capacity) : '',
  latitude: el.lat,
  longitude: el.lng,
});

export const fiberEditFields: EditField[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'fiberCount', label: 'Hilos', type: 'select', options: CABLE_FIBER_COUNTS.map((c) => ({ value: String(c), label: fiberCountLabel(c) })) },
  { key: 'status', label: 'Estado', type: 'select', options: ['PLANNED', 'ACTIVE', 'INACTIVE', 'DAMAGED'].map((v) => ({ value: v, label: v })) },
];
