import { describe, expect, it, vi } from 'vitest';
import { OpticalConnectionsService } from './optical-connections.service.js';
import { ConnectionsTableService } from '../cables/connections-table.service.js';

function setup(mangaType = 'DISTRIBUCION_NORMAL') {
  const prisma = {
    box: { findUnique: vi.fn().mockResolvedValue({ id: 'mg', type: 'MANGA', mangaType }) },
    fiber: { findUnique: vi.fn().mockImplementation(async ({ where }) => ({ id: where.id, cableId: where.id === 'a' ? 'in' : 'out', number: 1 })) },
    cableConnection: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment', fiberFrom: 1, fiberTo: 12 }) },
    opticalTermination: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }) => ({ ...data, id: data.entityId })) },
    opticalConnection: { create: vi.fn().mockResolvedValue({ id: 'splice' }) },
  };
  const validator = { validateNoCycles: vi.fn().mockResolvedValue(true), validateTerminationAvailability: vi.fn().mockResolvedValue(true) };
  const service = new OpticalConnectionsService(prisma as never, validator as never, {} as never);
  return { prisma, service, validator };
}
const dto = { boxId: 'mg', sourceType: 'FIBER', sourceId: 'a', targetType: 'FIBER', targetId: 'b' };

describe('empalmes directos de distribución normal', () => {
  it.each(['DISTRIBUCION_NORMAL', 'PASO', 'EMPALME'])('guarda los dos extremos sin puertos en %s', async (mangaType) => {
    const { service, prisma } = setup(mangaType);
    await service.create({ ...dto });
    expect(prisma.opticalConnection.create.mock.calls[0][0].data).toMatchObject({ sourceFiberId: 'a', targetFiberId: 'b', sourceTerminationId: 'a', targetTerminationId: 'b' });
    expect(prisma.opticalTermination.create.mock.calls.map(([args]) => args.data.boxId)).toEqual(['mg', 'mg']);
  });
  it('rechaza dos hilos de la misma fibra', async () => {
    const { service, prisma } = setup();
    prisma.fiber.findUnique.mockResolvedValue({ id: 'a', cableId: 'same', number: 1 });
    await expect(service.create({ ...dto })).rejects.toThrow('dos fibras distintas');
    expect(prisma.opticalConnection.create).not.toHaveBeenCalled();
  });
  it('rechaza una conexión por puerto en la categoría normal', async () => {
    const { service } = setup();
    await expect(service.create({ ...dto, sourceType: 'BOX_PORT', targetType: 'BOX_PORT' })).rejects.toThrow('no tiene puertos ni splitters');
  });
  it('construye ambos lados del empalme sin presentar puertos físicos', async () => {
    const fiber = (id: string, code: string) => ({ id, number: 1, color: 'BLUE', cable: { cableId: code, cable: { code } } });
    const prisma = {
      box: { findUnique: vi.fn().mockResolvedValue({ type: 'MANGA', mangaType: 'DISTRIBUCION_NORMAL', capacity: 12 }) },
      splitter: { findMany: vi.fn().mockResolvedValue([]) },
      boxPort: { findMany: vi.fn().mockResolvedValue([]) },
      opticalConnection: { findMany: vi.fn().mockResolvedValue([{ id: 's', sourceTermination: { entityType: 'FIBER', entityId: 'a' }, targetTermination: { entityType: 'FIBER', entityId: 'b' }, sourceFiber: fiber('a', 'IN'), targetFiber: fiber('b', 'OUT') }]) },
    };
    const table = new ConnectionsTableService(prisma as never);
    const result = await (table as unknown as { boxTerminals(id: string): Promise<{ terminals: Array<{ key: string; fibers: Array<{ fiberId: string }> }>; linksByFiber: Map<string, string[]> }> }).boxTerminals('mg');
    expect(result.terminals.map((t) => t.key)).toEqual(['SPLICE:s']);
    expect(result.terminals[0].fibers.map((f) => f.fiberId)).toEqual(['a', 'b']);
    expect(result.linksByFiber.get('a')).toEqual(['OUT · hilo 1']);
    expect(result.linksByFiber.get('b')).toEqual(['IN · hilo 1']);
  });
});
