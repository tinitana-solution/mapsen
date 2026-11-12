import { describe, expect, it, vi } from 'vitest';
import { OpticalConnectionsService } from './optical-connections.service.js';

function setup(kinds = ['ODF', 'MANGA', 'NAP']) {
  const stops = kinds.map((elementType, i) => ({ elementType, elementId: `d${i}`, fiberFrom: 1, fiberTo: 12 }));
  const prisma = {
    cableConnection: { findMany: vi.fn().mockResolvedValue(stops), update: vi.fn().mockResolvedValue({}) },
    odf: { findUnique: vi.fn().mockResolvedValue({ capacity: 12, code: 'ODF' }) },
    box: { findUnique: vi.fn().mockResolvedValue({ capacity: 12, code: 'BOX' }) },
    fiber: { findFirst: vi.fn().mockResolvedValue({ id: 'f1' }) },
    opticalConnection: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
    boxPort: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'new-port' }) },
  };
  const sheet = { build: vi.fn().mockResolvedValue({ terminals: [{ key: 'BOX_PORT:p1', fibers: [], status: 'FREE' }] }) };
  const service = new OpticalConnectionsService(prisma as never, {} as never, sheet as never);
  const link = vi.spyOn(service, 'createFiberLink').mockResolvedValue({} as never);
  return { prisma, sheet, service, link, stops };
}

describe('asignación de puertos al trazar', () => {
  it.each([['ODF', 'MANGA'], ['MANGA', 'NAP'], ['MANGA', 'MANGA']])('registra ambos extremos %s y %s', async (a, b) => {
    const { service, link } = setup([a, b]);
    await service.assignCablePorts('c1');
    expect(link.mock.calls.map(([dto]) => [dto.deviceType, dto.deviceId, dto.fiberId])).toEqual([[a, 'd0', 'f1'], [b, 'd1', 'f1']]);
  });
  it('respeta conexiones existentes sin duplicarlas', async () => {
    const { service, prisma, link } = setup();
    prisma.opticalConnection.findFirst.mockResolvedValue({ id: 'existing' } as never);
    await service.assignCablePorts('c1');
    expect(link).not.toHaveBeenCalled();
  });
  it('evita puertos llenos y prefiere uno libre', async () => {
    const { service, sheet, link } = setup(['MANGA']);
    sheet.build.mockResolvedValue({ terminals: [
      { key: 'BOX_PORT:full', fibers: [{}, {}], status: 'USED' },
      { key: 'BOX_PORT:free', fibers: [], status: 'FREE' },
    ] } as never);
    await service.assignCablePorts('c1');
    expect(link.mock.calls[0][0].terminalKey).toBe('BOX_PORT:free');
  });
  it('crea un puerto para una caja sin inventario de puertos', async () => {
    const { service, sheet, link } = setup(['NAP']);
    sheet.build.mockResolvedValue({ terminals: [] });
    await service.assignCablePorts('c1');
    expect(link.mock.calls[0][0].terminalKey).toBe('BOX_PORT:new-port');
  });
  it('rechaza un ODF sin puertos disponibles', async () => {
    const { service, sheet, link } = setup(['ODF']);
    sheet.build.mockResolvedValue({ terminals: [] });
    await expect(service.assignCablePorts('c1')).rejects.toThrow('no tiene puertos disponibles');
    expect(link).not.toHaveBeenCalled();
  });
});


describe('distribución normal sin puertos', () => {
  function normal(role = 'START', otherRole = 'END', mangaType = 'DISTRIBUCION_NORMAL') {
    const env = setup(['MANGA']);
    env.stops[0].fiberTo = 3;
    Object.assign(env.stops[0], { cableId: 'out', role });
    env.prisma.box.findUnique.mockResolvedValue({ capacity: 12, code: 'MG', mangaType } as never);
    env.prisma.cableConnection.findMany.mockResolvedValueOnce(env.stops).mockResolvedValue([{ cableId: 'in', fiberFrom: 1, fiberTo: 3, role: otherRole }] as never);
    env.prisma.fiber.findFirst.mockImplementation(async ({ where }) => ({ id: `${where.cable.cableId}-${where.number}` }));
    const splice = vi.spyOn(env.service, 'create').mockResolvedValue({} as never);
    return { ...env, splice };
  }
  it.each(['DISTRIBUCION_NORMAL', 'PASO', 'EMPALME'])('une todos los hilos sin puertos en %s', async (mangaType) => {
    const env = normal('START', 'END', mangaType);
    await env.service.assignCablePorts('out');
    expect(env.splice.mock.calls.map(([dto]) => [dto.sourceId, dto.targetId])).toEqual([
      ['in-1', 'out-1'], ['in-2', 'out-2'], ['in-3', 'out-3'],
    ]);
    expect(env.link).not.toHaveBeenCalled();
    expect(env.prisma.boxPort.create).not.toHaveBeenCalled();
  });
  it('respeta empalmes existentes y no ocupa de nuevo sus hilos', async () => {
    const env = normal();
    env.prisma.opticalConnection.findFirst.mockResolvedValue({ id: 'used' } as never);
    await env.service.assignCablePorts('out');
    expect(env.splice).not.toHaveBeenCalled();
  });
  it('no une dos fibras que salen de la manga', async () => {
    const env = normal('START', 'START');
    await env.service.assignCablePorts('out');
    expect(env.splice).not.toHaveBeenCalled();
  });
  it('conserva la dirección cuando se traza después la fibra de entrada', async () => {
    const env = normal('END', 'START');
    await env.service.assignCablePorts('out');
    expect(env.splice.mock.calls[0][0]).toMatchObject({ sourceId: 'out-1', targetId: 'in-1', sourceType: 'FIBER', targetType: 'FIBER' });
  });
});
