import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConnectionsTableService, DeviceTerminal } from '../cables/connections-table.service.js';

type DeviceKind = 'ODF' | 'MANGA' | 'NAP';

// Un paso del recorrido de un hilo: el hilo `fiber*` está en el dispositivo `device*` (en `portLabel`,
// si entra en un puerto). `how` dice cómo se llegó: por la fibra desde el paso anterior o por una
// fusión (dos hilos en el mismo puerto, puertos fusionados en el Editor, o el splitter que reparte).
export interface TraceStep {
  id: number;
  parent: number | null;
  how: 'origin' | 'cable' | 'splice';
  deviceType: DeviceKind;
  deviceId: string;
  deviceName: string;
  portLabel: string | null;
  fiberId: string;
  cableId: string;
  cableCode: string;
  fiberNumber: number;
  fiberColor: string;
}

export interface TracedFiber {
  fiberId: string;
  cableId: string;
  cableCode: string;
  number: number;
  color: string;
  status: string;
  service: string | null;
  steps: TraceStep[];
}

interface Device { kind: DeviceKind; id: string; name: string; terminals: DeviceTerminal[] }
interface FiberInfo { id: string; cableId: string; cableCode: string; number: number; color: string }
type CableStop = { elementType: string; elementId: string; sequence: number; fiberFrom: number; fiberTo: number };

// Tope de pasos por hilo, por si los datos forman una red muy grande o con vueltas.
const MAX_STEPS = 500;

// Trazabilidad: sigue cada hilo por su fibra y por las fusiones que se registran en la tabla de
// conexiones (hilo → puerto) y en el Editor de Conexiones (puerto ⟷ puerto, splitters), así la traza
// usa los mismos datos que se ven y se editan en el resto de la aplicación.
@Injectable()
export class TraceService {
  constructor(private readonly prisma: PrismaService, private readonly connectionsTable: ConnectionsTableService) {}

  async traceDevice(type: 'odf' | 'box', id: string) {
    const ctx = new TraceContext(this.prisma, this.connectionsTable);
    const kind = await ctx.kindOf(type, id);
    if (!kind) throw new NotFoundException('Dispositivo no encontrado');
    const origin = await ctx.device(kind, id);
    if (!origin) throw new NotFoundException('Dispositivo no encontrado');

    const table = await this.connectionsTable.build(kind, id, kind === 'ODF' ? await ctx.odfCapacity(id) : null);
    const fibers: TracedFiber[] = [];
    for (const cable of table.cables) {
      for (const buffer of cable.buffers) {
        for (const fiber of buffer.fibers) {
          ctx.rememberFiber({ id: fiber.id, cableId: cable.cableId, cableCode: cable.code, number: fiber.number, color: fiber.color });
          fibers.push({
            fiberId: fiber.id,
            cableId: cable.cableId,
            cableCode: cable.code,
            number: fiber.number,
            color: fiber.color,
            status: fiber.status,
            service: fiber.service,
            steps: await ctx.traceFiber(origin, fiber.id),
          });
        }
      }
    }
    return { device: { kind, id, name: origin.name }, fibers };
  }
}

class TraceContext {
  private devices = new Map<string, Promise<Device | null>>();
  private stops = new Map<string, Promise<CableStop[]>>();
  private fibers = new Map<string, FiberInfo>();

  constructor(private readonly prisma: PrismaService, private readonly table: ConnectionsTableService) {}

  async kindOf(type: 'odf' | 'box', id: string): Promise<DeviceKind | null> {
    if (type === 'odf') {
      const odf = await this.prisma.odf.findUnique({ where: { id }, select: { deletedAt: true } });
      return odf && !odf.deletedAt ? 'ODF' : null;
    }
    const box = await this.prisma.box.findUnique({ where: { id }, select: { type: true, deletedAt: true } });
    return box && !box.deletedAt && (box.type === 'MANGA' || box.type === 'NAP') ? box.type : null;
  }

  async odfCapacity(id: string) {
    return (await this.prisma.odf.findUnique({ where: { id }, select: { capacity: true } }))?.capacity ?? null;
  }

  rememberFiber(fiber: FiberInfo) {
    this.fibers.set(fiber.id, fiber);
  }

  device(kind: DeviceKind, id: string) {
    const key = `${kind}:${id}`;
    if (!this.devices.has(key)) this.devices.set(key, this.loadDevice(kind, id));
    return this.devices.get(key)!;
  }

  private async loadDevice(kind: DeviceKind, id: string): Promise<Device | null> {
    if (kind === 'ODF') {
      const odf = await this.prisma.odf.findUnique({ where: { id }, select: { code: true, name: true, capacity: true, deletedAt: true } });
      if (!odf || odf.deletedAt) return null;
      const sheet = await this.table.build('ODF', id, odf.capacity);
      return { kind, id, name: odf.name || odf.code, terminals: sheet.terminals };
    }
    const box = await this.prisma.box.findUnique({ where: { id }, select: { code: true, name: true, type: true, deletedAt: true } });
    if (!box || box.deletedAt || (box.type !== 'MANGA' && box.type !== 'NAP')) return null;
    const sheet = await this.table.build(box.type, id);
    return { kind: box.type, id, name: box.name || box.code, terminals: sheet.terminals };
  }

  private cableStops(cableId: string) {
    if (!this.stops.has(cableId)) {
      this.stops.set(cableId, this.prisma.cableConnection.findMany({
        where: { cableId, cable: { deletedAt: null } },
        orderBy: { sequence: 'asc' },
        select: { elementType: true, elementId: true, sequence: true, fiberFrom: true, fiberTo: true },
      }));
    }
    return this.stops.get(cableId)!;
  }

  private async fiber(id: string): Promise<FiberInfo | null> {
    const known = this.fibers.get(id);
    if (known) return known;
    const fiber = await this.prisma.fiber.findUnique({
      where: { id },
      select: { id: true, number: true, color: true, deletedAt: true, cable: { select: { cableId: true, cable: { select: { code: true } } } } },
    });
    if (!fiber || fiber.deletedAt) return null;
    const info = { id: fiber.id, cableId: fiber.cable.cableId, cableCode: fiber.cable.cable.code, number: fiber.number, color: fiber.color };
    this.fibers.set(id, info);
    return info;
  }

  // Hilos que siguen a `fiberId` dentro del dispositivo: los otros hilos de su puerto, los de los
  // puertos fusionados con él y, en un splitter, los del lado repartido (o el común).
  private partners(device: Device, fiberId: string) {
    const terminal = device.terminals.find((t) => t.fibers.some((f) => f.fiberId === fiberId));
    if (!terminal) return { terminal: null, partners: [] as Array<{ fiberId: string; terminal: DeviceTerminal }> };
    const related = new Set<DeviceTerminal>([terminal]);
    for (const peer of terminal.peers) {
      const match = device.terminals.find((t) => t.label === peer);
      if (match) related.add(match);
    }
    const [portType] = terminal.key.split(':');
    if (portType === 'SPLITTER_INPUT' || portType === 'SPLITTER_OUTPUT') {
      const otherSide = portType === 'SPLITTER_INPUT' ? 'SPLITTER_OUTPUT' : 'SPLITTER_INPUT';
      for (const t of device.terminals) if (t.group === terminal.group && t.key.startsWith(`${otherSide}:`)) related.add(t);
    }
    const partners = [...related].flatMap((t) => t.fibers.filter((f) => f.fiberId !== fiberId).map((f) => ({ fiberId: f.fiberId, terminal: t })));
    return { terminal, partners };
  }

  async traceFiber(origin: Device, fiberId: string): Promise<TraceStep[]> {
    const steps: TraceStep[] = [];
    const visited = new Set<string>();
    const start = await this.fiber(fiberId);
    if (!start) return steps;

    const addStep = (parent: number | null, how: TraceStep['how'], device: Device, fiber: FiberInfo, portLabel: string | null) => {
      const step: TraceStep = {
        id: steps.length,
        parent,
        how,
        deviceType: device.kind,
        deviceId: device.id,
        deviceName: device.name,
        portLabel,
        fiberId: fiber.id,
        cableId: fiber.cableId,
        cableCode: fiber.cableCode,
        fiberNumber: fiber.number,
        fiberColor: fiber.color,
      };
      steps.push(step);
      return step;
    };

    // Recorre la fibra del hilo desde `device` hasta el dispositivo vecino (antes y después en el trazado).
    const travel = async (fiber: FiberInfo, device: Device, parent: number, direction?: 1 | -1) => {
      const along = (await this.cableStops(fiber.cableId)).filter((s) => fiber.number >= s.fiberFrom && fiber.number <= s.fiberTo);
      const here = along.findIndex((s) => s.elementType === device.kind && s.elementId === device.id);
      if (here < 0) return;
      for (const offset of direction ? [direction] : [-1, 1]) {
        const next = along[here + offset];
        if (!next) continue;
        const key = `${fiber.id}@${next.elementType}:${next.elementId}`;
        if (visited.has(key) || steps.length >= MAX_STEPS) continue;
        visited.add(key);
        const nextDevice = await this.device(next.elementType as DeviceKind, next.elementId);
        if (!nextDevice) continue;
        const { terminal } = this.partners(nextDevice, fiber.id);
        const step = addStep(parent, 'cable', nextDevice, fiber, terminal?.label ?? null);
        await arrive(fiber, nextDevice, step.id, offset as 1 | -1);
      }
    };

    // El hilo llegó a un dispositivo: sigue por sus fusiones; si no entra en ningún puerto, pasa de largo
    // por la misma fibra. Un hilo en un puerto sin nada más fusionado termina ahí.
    const arrive = async (fiber: FiberInfo, device: Device, parent: number, direction?: 1 | -1) => {
      const mappings = device.terminals.filter((t) => t.key.startsWith('MAPPING:'));
      if (direction && mappings.length) {
        const from = direction === 1 ? 0 : 1;
        const to = 1 - from;
        const mapping = mappings.find((t) => t.fibers[from]?.fiberId === fiber.id);
        if (mapping) {
          const partnerId = mapping.fibers[to]?.fiberId;
          const next = partnerId ? await this.fiber(partnerId) : null;
          if (!next || steps.length >= MAX_STEPS) return;
          visited.add(`${next.id}@${device.kind}:${device.id}`);
          const step = addStep(parent, 'splice', device, next, mapping.label);
          await travel(next, device, step.id, direction);
          return;
        }
        // Si ese extremo ya fue redirigido desde otra entrada, no hay continuidad implícita.
        if (mappings.some((t) => t.fibers[to]?.fiberId === fiber.id)) return;
      }
      const { terminal, partners } = this.partners(device, fiber.id);
      if (!terminal) {
        await travel(fiber, device, parent, direction);
        return;
      }
      for (const partner of partners) {
        const key = `${partner.fiberId}@${device.kind}:${device.id}`;
        if (visited.has(key) || steps.length >= MAX_STEPS) continue;
        visited.add(key);
        const next = await this.fiber(partner.fiberId);
        if (!next) continue;
        const step = addStep(parent, 'splice', device, next, partner.terminal.label);
        await travel(next, device, step.id);
      }
    };

    visited.add(`${start.id}@${origin.kind}:${origin.id}`);
    const { terminal } = this.partners(origin, start.id);
    const first = addStep(null, 'origin', origin, start, terminal?.label ?? null);
    const startsAtMapping = origin.terminals.some((t) => t.key.startsWith('MAPPING:') && t.fibers[0]?.fiberId === start.id);
    await travel(start, origin, first.id, startsAtMapping ? -1 : undefined);
    // En el propio origen el hilo también puede estar fusionado con otros (p. ej. en una manga).
    await arrive(start, origin, first.id, startsAtMapping ? 1 : undefined);
    return steps;
  }
}
