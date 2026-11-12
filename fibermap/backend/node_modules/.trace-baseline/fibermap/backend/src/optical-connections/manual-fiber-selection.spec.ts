import { describe, expect, it, vi } from 'vitest';
import { OpticalConnectionsService } from './optical-connections.service.js';
function setup() {
  const prisma = {
    box: { findUnique: vi.fn().mockResolvedValue({ id: 'nap', type: 'NAP' }) },
    fiber: { findUnique: vi.fn().mockResolvedValue({ id: 'f10', number: 10, cable: { cableId: 'c4', cable: { code: 'FIBRA-4' } } }) },
    cableConnection: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment', fiberFrom: 1, fiberTo: 1 }), update: vi.fn().mockResolvedValue({}) },
    splitterPort: { findUnique: vi.fn().mockResolvedValue({ id: 'port', portType: 'OUTPUT', number: 1, splitter: { boxId: 'nap', code: 'SPL' } }), update: vi.fn().mockResolvedValue({}) },
    opticalConnection: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'link' }) },
    opticalTermination: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }) => ({ id: data.entityId })) },
  };
  const sheet = { build: vi.fn().mockResolvedValue({ terminals: [{ key: 'SPLITTER_OUTPUT:port', fibers: [] }] }) };
  const service = new OpticalConnectionsService(prisma as never, {} as never, sheet as never);
  return { prisma, sheet, service };
}
const dto = { deviceType: 'NAP', deviceId: 'nap', fiberId: 'f10', terminalKey: 'SPLITTER_OUTPUT:port' };
describe('elección de cualquier hilo del cable trazado', () => {
  it('conecta el hilo 10 aunque la asignación inicial solo cubra el 1', async () => {
    const { service, prisma } = setup();
    await service.createFiberLink(dto);
    expect(prisma.cableConnection.findFirst.mock.calls[0][0].where).not.toHaveProperty('fiberFrom');
    expect(prisma.opticalConnection.create.mock.calls[0][0].data).toMatchObject({ sourceFiberId: 'f10', targetFiberId: 'f10' });
    expect(prisma.cableConnection.update.mock.calls[0][0].data).toEqual({ fiberFrom: 1, fiberTo: 10 });
  });
  it('rechaza un hilo de un cable que no toca la caja', async () => {
    const { service, prisma } = setup();
    prisma.cableConnection.findFirst.mockResolvedValue(null as never);
    await expect(service.createFiberLink(dto)).rejects.toThrow('no llega a este dispositivo');
    expect(prisma.opticalConnection.create).not.toHaveBeenCalled();
  });
  it('no cambia el rango cuando el puerto está lleno', async () => {
    const { service, prisma, sheet } = setup();
    sheet.build.mockResolvedValue({ terminals: [{ key: 'SPLITTER_OUTPUT:port', fibers: [{ fiberId: 'other1' }, { fiberId: 'other2' }] }] } as never);
    await expect(service.createFiberLink(dto)).rejects.toThrow('ya une dos hilos');
    expect(prisma.cableConnection.update).not.toHaveBeenCalled();
  });
});
