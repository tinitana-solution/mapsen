import { describe, expect, it, vi } from 'vitest';
import { OpticalConnectionsService } from './optical-connections.service.js';

function setup() {
  const cables = [
    { cableId: 'in', role: 'END', fiberFrom: 1, fiberTo: 2 },
    { cableId: 'out', role: 'START', fiberFrom: 1, fiberTo: 2 },
  ];
  const fibers = [
    { id: 'in-1', cableId: 'in', number: 1 },
    { id: 'in-2', cableId: 'in', number: 2 },
    { id: 'out-1', cableId: 'out', number: 1 },
    { id: 'out-2', cableId: 'out', number: 2 },
  ];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    cableConnection: { findMany: vi.fn().mockResolvedValue(cables) },
    fiber: { findMany: vi.fn().mockResolvedValue(fibers) },
    opticalConnection: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    opticalTermination: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: data.entityId })),
    },
  };
  const prisma = {
    cableConnection: { findMany: vi.fn().mockResolvedValue([{ elementId: 'manga' }]) },
    box: { findMany: vi.fn().mockResolvedValue([{ id: 'manga' }]) },
    $transaction: vi.fn().mockImplementation((action) => action(tx)),
  };
  return { tx, prisma, service: new OpticalConnectionsService(prisma as never, {} as never, {} as never) };
}

describe('conexión automática de mangas de empalme', () => {
  it('conecta los hilos con el mismo número', async () => {
    const { service, tx, prisma } = setup();
    await expect(service.assignCablePorts('out')).resolves.toMatchObject({ assignedPorts: 2 });
    expect(prisma.box.findMany.mock.calls[0][0].where.mangaType).toBe('EMPALME');
    expect(tx.opticalConnection.create.mock.calls.map(([call]) => [
      call.data.sourceFiberId, call.data.targetFiberId,
    ])).toEqual([['in-1', 'out-1'], ['in-2', 'out-2']]);
  });

  it('conserva los hilos que ya tienen conexiones', async () => {
    const { service, tx } = setup();
    tx.opticalConnection.findMany.mockResolvedValue([{
      sourceTermination: { entityType: 'FIBER', entityId: 'in-1' },
      targetTermination: { entityType: 'FIBER', entityId: 'out-2' },
    }]);
    await expect(service.assignCablePorts('out')).resolves.toMatchObject({ assignedPorts: 0 });
    expect(tx.opticalConnection.create).not.toHaveBeenCalled();
  });

  it('espera cuando hay varias entradas o cables de paso', async () => {
    const { service, tx } = setup();
    tx.cableConnection.findMany.mockResolvedValue([
      { cableId: 'pass', role: 'PASS', fiberFrom: 1, fiberTo: 2 },
      { cableId: 'out', role: 'START', fiberFrom: 1, fiberTo: 2 },
    ]);
    await expect(service.assignCablePorts('out')).resolves.toMatchObject({ assignedPorts: 0 });
    expect(tx.opticalConnection.create).not.toHaveBeenCalled();
  });
});
