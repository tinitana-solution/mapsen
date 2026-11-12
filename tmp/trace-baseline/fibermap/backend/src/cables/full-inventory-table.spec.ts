import { describe, expect, it, vi } from 'vitest';
import { ConnectionsTableService } from './connections-table.service.js';
function setup() {
  const tubes = [1, 2].map((number) => ({ number, color: number === 1 ? 'BLUE' : 'ORANGE', fibers: Array.from({ length: 6 }, (_, i) => ({ id: `f${(number-1)*6+i+1}`, number: (number-1)*6+i+1, numberInTube: i+1, color: 'BLUE', status: 'FREE', label: null })) }));
  const prisma = { cableConnection: { findMany: vi.fn().mockResolvedValueOnce([{ fiberFrom: 1, fiberTo: 1, role: 'END', cable: { id: 'c1', code: 'FIBRA-4', name: null, fiberCount: 12, startNodeType: 'MANGA', tubes } }]).mockResolvedValue([]) } };
  const service = new ConnectionsTableService(prisma as never);
  vi.spyOn(service as never, 'boxTerminals').mockResolvedValue({ terminals: [], linksByFiber: new Map() } as never);
  return service;
}
describe('inventario completo en las tablas de fibra', () => {
  it('muestra los 12 hilos y ambos buffers aunque solo esté asignado el hilo 1', async () => {
    const table = await setup().build('NAP', 'nap', null, true);
    expect(table.cables[0].buffers.map((buffer) => buffer.fibers.map((fiber) => fiber.number))).toEqual([[1,2,3,4,5,6],[7,8,9,10,11,12]]);
    expect(table.cables[0].fiberTo).toBe(1);
    expect(table.cables[0].buffers.flatMap((buffer) => buffer.fibers).every((fiber) => fiber.links.length === 0)).toBe(true);
  });
  it('conserva el rango asignado en las consultas usadas para trazar la señal', async () => {
    const table = await setup().build('NAP', 'nap');
    expect(table.cables[0].buffers.flatMap((buffer) => buffer.fibers).map((fiber) => fiber.number)).toEqual([1]);
  });
});
