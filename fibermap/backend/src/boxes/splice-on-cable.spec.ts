import { describe, expect, it, vi } from 'vitest';
import { BoxesService } from './boxes.service.js';

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ geojson: JSON.stringify({ type: 'LineString', coordinates: [[0, 0], [0, 0.001]] }) }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    cable: { findUnique: vi.fn().mockResolvedValue({ id: 'cable', projectId: 'project', fiberCount: 6, deletedAt: null }) },
    cableConnection: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
    box: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'splice', ...data })),
    },
    odf: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: vi.fn().mockImplementation((operation) => operation(tx)) };
  const service = new BoxesService(prisma as never, {} as never, {} as never);
  return { tx, service };
}

describe('manga de empalme sobre una fibra', () => {
  it('proyecta la manga al cable y conecta todos sus hilos en una transacción', async () => {
    const { tx, service } = setup();
    const result = await service.create({ name: 'M-1', type: 'MANGA', mangaType: 'EMPALME', lat: 0.0005, lng: 0.00001, cableId: 'cable' });
    expect(Number(result.latitude)).toBeCloseTo(0.0005, 8);
    expect(Number(result.longitude)).toBeCloseTo(0, 8);
    expect(tx.cableConnection.create).toHaveBeenCalledWith({
      data: { cableId: 'cable', elementType: 'MANGA', elementId: 'splice', sequence: 0, role: 'PASS', fiberFrom: 1, fiberTo: 6 },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('rechaza una manga de distribución sobre el cable', async () => {
    const { service, tx } = setup();
    await expect(service.create({ name: 'M-1', type: 'MANGA', mangaType: 'DISTRIBUCION', lat: 0, lng: 0, cableId: 'cable' })).rejects.toThrow('Solo una manga de empalme');
    expect(tx.box.create).not.toHaveBeenCalled();
  });

  it('rechaza un punto alejado del cable antes de crear la manga', async () => {
    const { service, tx } = setup();
    await expect(service.create({ name: 'M-1', type: 'MANGA', mangaType: 'EMPALME', lat: 0.0005, lng: 0.01, cableId: 'cable' })).rejects.toThrow('sobre el trazado');
    expect(tx.box.create).not.toHaveBeenCalled();
  });
});
