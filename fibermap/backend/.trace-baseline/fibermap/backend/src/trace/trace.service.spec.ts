import { describe, expect, it } from 'vitest';
import { TraceService } from './trace.service.js';
import type { DeviceTerminal } from '../cables/connections-table.service.js';

// Red de prueba: ODF-1 —F-1→ M-1 (el hilo 1 de F-1 se fusiona con el hilo 1 de F-5 en el puerto 3)
// —F-5→ NAP-A (el hilo pasa de largo, no entra a ningún puerto) —F-5→ NAP-B (entra al splitter).
const fibers: Record<string, { cableId: string; code: string; number: number }> = {
  'f1-1': { cableId: 'F-1', code: 'F-1', number: 1 },
  'f1-2': { cableId: 'F-1', code: 'F-1', number: 2 },
  'f5-1': { cableId: 'F-5', code: 'F-5', number: 1 },
};
const stops: Record<string, Array<{ elementType: string; elementId: string; sequence: number; fiberFrom: number; fiberTo: number }>> = {
  'F-1': [
    { elementType: 'ODF', elementId: 'odf', sequence: 0, fiberFrom: 1, fiberTo: 12 },
    { elementType: 'MANGA', elementId: 'manga', sequence: 1, fiberFrom: 1, fiberTo: 12 },
  ],
  'F-5': [
    { elementType: 'MANGA', elementId: 'manga', sequence: 0, fiberFrom: 1, fiberTo: 12 },
    { elementType: 'NAP', elementId: 'napA', sequence: 1, fiberFrom: 1, fiberTo: 12 },
    { elementType: 'NAP', elementId: 'napB', sequence: 2, fiberFrom: 1, fiberTo: 12 },
  ],
};
const fiberOn = (id: string) => ({ fiberId: id, cableId: fibers[id].cableId, cableCode: fibers[id].code, number: fibers[id].number, color: 'AZUL' });
const terminal = (key: string, label: string, fiberIds: string[], group = 'Puertos'): DeviceTerminal =>
  ({ key, group, label, status: 'USED', fibers: fiberIds.map(fiberOn), peers: [], remote: [] });
const sheets: Record<string, DeviceTerminal[]> = {
  odf: [terminal('ODF_PORT:1', 'Puerto 1', ['f1-1']), terminal('ODF_PORT:2', 'Puerto 2', ['f1-2'])],
  manga: [terminal('BOX_PORT:p3', 'Puerto 3', ['f1-1', 'f5-1'])],
  napA: [],
  napB: [terminal('SPLITTER_OUTPUT:s1', 'SPL · Puerto 1', ['f5-1'], 'Splitter SPL (1:8)')],
};
const devices: Record<string, { code: string; type?: string }> = { odf: { code: 'ODF-1' }, manga: { code: 'M-1', type: 'MANGA' }, napA: { code: 'NAP-A', type: 'NAP' }, napB: { code: 'NAP-B', type: 'NAP' } };

const prisma = {
  odf: { findUnique: async ({ where }: any) => (devices[where.id] ? { code: devices[where.id].code, name: null, capacity: 12, deletedAt: null } : null) },
  box: { findUnique: async ({ where }: any) => (devices[where.id]?.type ? { code: devices[where.id].code, name: null, type: devices[where.id].type, deletedAt: null } : null) },
  cableConnection: { findMany: async ({ where }: any) => stops[where.cableId] ?? [] },
  fiber: {
    findUnique: async ({ where }: any) => {
      const f = fibers[where.id];
      return f ? { id: where.id, number: f.number, color: 'AZUL', deletedAt: null, cable: { cableId: f.cableId, cable: { code: f.code } } } : null;
    },
  },
};
const table = {
  build: async (_kind: string, id: string) => ({
    portsInUse: 0,
    terminals: sheets[id],
    cables: id === 'odf'
      ? [{ cableId: 'F-1', code: 'F-1', buffers: [{ fibers: ['f1-1', 'f1-2'].map((fid) => ({ id: fid, number: fibers[fid].number, color: 'AZUL', status: 'USED', service: null })) }] }]
      : [],
  }),
};

describe('TraceService', () => {
  const service = new TraceService(prisma as any, table as any);

  it('sigue el hilo por la fibra, las fusiones de la manga y las NAP de paso hasta el splitter', async () => {
    const result = await service.traceDevice('odf', 'odf');
    const hilo1 = result.fibers.find((f) => f.fiberId === 'f1-1')!;
    expect(hilo1.steps.map((s) => [s.deviceId, s.how, s.cableCode, s.fiberNumber, s.portLabel])).toEqual([
      ['odf', 'origin', 'F-1', 1, 'Puerto 1'],
      ['manga', 'cable', 'F-1', 1, 'Puerto 3'],
      ['manga', 'splice', 'F-5', 1, 'Puerto 3'],
      ['napA', 'cable', 'F-5', 1, null],
      ['napB', 'cable', 'F-5', 1, 'SPL · Puerto 1'],
    ]);
  });

  it('un hilo sin fusión en la manga termina ahí', async () => {
    const result = await service.traceDevice('odf', 'odf');
    const hilo2 = result.fibers.find((f) => f.fiberId === 'f1-2')!;
    expect(hilo2.steps.map((s) => s.deviceId)).toEqual(['odf', 'manga']);
  });
});


describe('cambio de hilo en un cable que pasa por la manga', () => {
  it('sigue entrada 1 hacia salida 2 y continúa aguas abajo sin regresar al ODF por el hilo 2', async () => {
    const originalStops = stops['F-1'];
    const originalManga = sheets.manga;
    const originalNap = sheets.napB;
    try {
      stops['F-1'] = [...originalStops, { elementType: 'NAP', elementId: 'napB', sequence: 2, fiberFrom: 1, fiberTo: 12 }];
      sheets.manga = [terminal('MAPPING:a', 'Empalme', ['f1-1', 'f1-2']), terminal('MAPPING:b', 'Empalme', ['f1-2', 'f1-1'])];
      sheets.napB = [terminal('BOX_PORT:p2', 'Puerto 2', ['f1-2'])];
      const result = await new TraceService(prisma as any, table as any).traceDevice('odf', 'odf');
      const path = result.fibers.find((f) => f.fiberId === 'f1-1')!.steps;
      expect(path.map((step) => [step.deviceId, step.how, step.fiberNumber])).toEqual([
        ['odf', 'origin', 1], ['manga', 'cable', 1], ['manga', 'splice', 2], ['napB', 'cable', 2],
      ]);
    } finally { stops['F-1'] = originalStops; sheets.manga = originalManga; sheets.napB = originalNap; }
  });
});
