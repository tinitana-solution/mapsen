import { describe, expect, it, vi } from 'vitest';
import { OpticalConnectionsService } from './optical-connections.service.js';
function setup(active: Array<{ id: string; sourceFiberId: string; targetFiberId: string }> = []) {
  const tx = {
    box: { findUnique: vi.fn().mockResolvedValue({ id: 'mg', type: 'MANGA', mangaType: 'PASO' }) },
    fiber: { findUnique: vi.fn().mockImplementation(async ({ where }) => ({ id: where.id, cableId: 'c1', number: Number(where.id.slice(1)) })) },
    cableConnection: { findMany: vi.fn().mockResolvedValue([{ id: 'stop', cableId: 'c1', role: 'PASS', fiberFrom: 1, fiberTo: 12 }]), update: vi.fn() },
    opticalConnection: { findMany: vi.fn().mockResolvedValue(active), updateMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockImplementation(async ({ data }) => data) },
    opticalTermination: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }) => ({ id: `${data.entityType}:${data.entityId}` })) },
  };
  const prisma = { $transaction: vi.fn().mockImplementation(async (fn) => fn(tx)) };
  const service = new OpticalConnectionsService(prisma as never, {} as never, {} as never);
  return { tx, service };
}
const dto = { boxId: 'mg', sourceFiberId: 'f1', targetFiberId: 'f12' };
describe('salida modificable con entrada fija', () => {
  it('permite entrada 1 a salida 12 en el mismo cable de paso e intercambia la entrada 12 a salida 1', async () => {
    const { tx, service } = setup();
    await service.setNormalMapping(dto);
    expect(tx.opticalConnection.create.mock.calls.map(([args]) => [args.data.sourceFiberId, args.data.targetFiberId])).toEqual([['f1', 'f12'], ['f12', 'f1']]);
    expect(tx.opticalConnection.create.mock.calls[0][0].data).toMatchObject({ sourceTerminationId: 'FIBER_IN:f1', targetTerminationId: 'FIBER_OUT:f12' });
  });
  it('cambia dos empalmes existentes conservando sus entradas', async () => {
    const { tx, service } = setup([{ id: 'a', sourceFiberId: 'f1', targetFiberId: 'f2' }, { id: 'b', sourceFiberId: 'f3', targetFiberId: 'f12' }]);
    await service.setNormalMapping(dto);
    expect(tx.opticalConnection.create.mock.calls.map(([args]) => [args.data.sourceFiberId, args.data.targetFiberId])).toEqual([['f1', 'f12'], ['f3', 'f2']]);
    expect(tx.opticalConnection.updateMany.mock.calls[0][0].where.id.in).toEqual(['a', 'b']);
  });
  it('permite volver a la continuidad 1 a 1', async () => {
    const { tx, service } = setup([{ id: 'a', sourceFiberId: 'f1', targetFiberId: 'f12' }, { id: 'b', sourceFiberId: 'f12', targetFiberId: 'f1' }]);
    await service.setNormalMapping({ ...dto, targetFiberId: 'f1' });
    expect(tx.opticalConnection.create.mock.calls.map(([args]) => [args.data.sourceFiberId, args.data.targetFiberId])).toEqual([['f1', 'f1'], ['f12', 'f12']]);
  });
  it('amplía el rango una sola vez sin perder el hilo de entrada elegido', async () => {
    const { tx, service } = setup();
    tx.cableConnection.findMany.mockResolvedValue([{ id: 'stop', cableId: 'c1', role: 'PASS', fiberFrom: 3, fiberTo: 3 }]);
    await service.setNormalMapping({ ...dto, sourceFiberId: 'f10', targetFiberId: 'f2' });
    expect(tx.cableConnection.update.mock.calls[0][0].data).toEqual({ fiberFrom: 2, fiberTo: 10 });
  });
  it('rechaza fibras que no pasan por la manga antes de modificar conexiones', async () => {
    const { tx, service } = setup();
    tx.cableConnection.findMany.mockResolvedValue([]);
    await expect(service.setNormalMapping(dto)).rejects.toThrow('pasar por esta manga');
    expect(tx.opticalConnection.updateMany).not.toHaveBeenCalled();
    expect(tx.opticalConnection.create).not.toHaveBeenCalled();
  });
  it('evita duplicar una salida si una entrada ha quedado pendiente', async () => {
    const { tx, service } = setup([{ id: 'a', sourceFiberId: 'f3', targetFiberId: 'f1' }]);
    await expect(service.setNormalMapping(dto)).rejects.toThrow('salida está ocupada');
    expect(tx.opticalConnection.create).not.toHaveBeenCalled();
  });
});
