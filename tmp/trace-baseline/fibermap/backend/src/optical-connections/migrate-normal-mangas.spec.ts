import { describe, expect, it, vi } from 'vitest';
const modulePath = '../../scripts/migrate-normal-mangas.mjs';
const { migrateNormalMangas } = await import(modulePath);
function fixture() {
  const link = (id: string, fiberId: string, cableId: string, number: number) => ({ id, sourceTerminationId: `end-${id}`, sourceTermination: { entityType: 'FIBER' }, targetTermination: { entityType: 'BOX_PORT', entityId: 'old-port' }, sourceFiber: { id: fiberId, cableId, number } });
  const tx = {
    opticalConnection: { findMany: vi.fn().mockResolvedValue([link('a', 'blue-in', 'in', 1), link('b', 'orange-out', 'out', 2)]), findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 2 }), create: vi.fn().mockResolvedValue({}) },
    cableConnection: { findFirst: vi.fn().mockResolvedValue({ role: 'END' }) },
    boxPort: { updateMany: vi.fn().mockResolvedValue({}) },
    splitter: { updateMany: vi.fn().mockResolvedValue({}) },
    box: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { box: { findMany: vi.fn().mockResolvedValue([{ id: 'mg', code: 'MG' }]) }, $transaction: vi.fn().mockImplementation((fn) => fn(tx)) };
  return { tx, prisma };
}
describe('conversión de puertos antiguos a empalmes normales', () => {
  it('conserva una pareja personalizada, incluso si sus hilos tienen números diferentes', async () => {
    const { tx, prisma } = fixture();
    expect(await migrateNormalMangas(prisma)).toEqual({ boxes: 1, splices: 1 });
    expect(tx.opticalConnection.create.mock.calls[0][0].data).toMatchObject({ sourceFiberId: 'blue-in', targetFiberId: 'orange-out', sourceTerminationId: 'end-a', targetTerminationId: 'end-b' });
    expect(tx.opticalConnection.updateMany.mock.calls[0][0].where.id.in).toEqual(['a', 'b']);
  });
  it('se puede repetir sin duplicar empalmes ya convertidos', async () => {
    const { tx, prisma } = fixture();
    await migrateNormalMangas(prisma);
    tx.opticalConnection.findMany.mockResolvedValue([{ sourceTermination: { entityType: 'FIBER' }, targetTermination: { entityType: 'FIBER' } }] as never);
    await migrateNormalMangas(prisma);
    expect(tx.opticalConnection.create).toHaveBeenCalledTimes(1);
  });
  it('detiene la conversión si hay conexiones que no puede interpretar', async () => {
    const { tx, prisma } = fixture();
    tx.opticalConnection.findMany.mockResolvedValue([{ sourceTermination: { entityType: 'BOX_PORT' }, targetTermination: { entityType: 'BOX_PORT' } }] as never);
    await expect(migrateNormalMangas(prisma)).rejects.toThrow('No se modificó esta manga');
    expect(tx.opticalConnection.updateMany).not.toHaveBeenCalled();
    expect(tx.boxPort.updateMany).not.toHaveBeenCalled();
  });
});
