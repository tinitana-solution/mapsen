var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConnectionsTableService } from '../cables/connections-table.service.js';
const MAX_STEPS = 500;
let TraceService = class TraceService {
    prisma;
    connectionsTable;
    constructor(prisma, connectionsTable) {
        this.prisma = prisma;
        this.connectionsTable = connectionsTable;
    }
    async traceDevice(type, id, fiberId) {
        const ctx = new TraceContext(this.prisma, this.connectionsTable);
        const kind = await ctx.kindOf(type, id);
        if (!kind)
            throw new NotFoundException('Dispositivo no encontrado');
        const origin = await ctx.device(kind, id);
        if (!origin)
            throw new NotFoundException('Dispositivo no encontrado');
        const fibers = [];
        for (const cable of origin.sheet.cables) {
            for (const buffer of cable.buffers) {
                for (const fiber of buffer.fibers) {
                    if (fiberId !== undefined && fiber.id !== fiberId)
                        continue;
                    ctx.rememberFiber({ id: fiber.id, cableId: cable.cableId, cableCode: cable.code, number: fiber.number, color: fiber.color });
                    fibers.push({
                        fiberId: fiber.id,
                        cableId: cable.cableId,
                        cableCode: cable.code,
                        number: fiber.number,
                        color: fiber.color,
                        status: fiber.status,
                        service: fiber.service,
                        ...await ctx.traceFiber(origin, fiber.id),
                    });
                }
            }
        }
        if (fiberId !== undefined && !fibers.length)
            throw new NotFoundException('El hilo no pertenece al rango de cables de este dispositivo');
        return { device: { kind, id, name: origin.name }, fibers };
    }
};
TraceService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService, ConnectionsTableService])
], TraceService);
export { TraceService };
class TraceContext {
    prisma;
    table;
    devices = new Map();
    stops = new Map();
    fibers = new Map();
    constructor(prisma, table) {
        this.prisma = prisma;
        this.table = table;
    }
    async kindOf(type, id) {
        if (type === 'odf') {
            const odf = await this.prisma.odf.findUnique({ where: { id }, select: { deletedAt: true } });
            return odf && !odf.deletedAt ? 'ODF' : null;
        }
        const box = await this.prisma.box.findUnique({ where: { id }, select: { type: true, deletedAt: true } });
        return box && !box.deletedAt && (box.type === 'MANGA' || box.type === 'NAP') ? box.type : null;
    }
    rememberFiber(fiber) {
        this.fibers.set(fiber.id, fiber);
    }
    device(kind, id) {
        const key = `${kind}:${id}`;
        if (!this.devices.has(key))
            this.devices.set(key, this.loadDevice(kind, id));
        return this.devices.get(key);
    }
    async loadDevice(kind, id) {
        if (kind === 'ODF') {
            const odf = await this.prisma.odf.findUnique({ where: { id }, select: { code: true, name: true, capacity: true, deletedAt: true } });
            if (!odf || odf.deletedAt)
                return null;
            const sheet = await this.table.build('ODF', id, odf.capacity);
            return { kind, id, name: odf.name || odf.code, sheet };
        }
        const box = await this.prisma.box.findUnique({ where: { id }, select: { code: true, name: true, type: true, deletedAt: true } });
        if (!box || box.deletedAt || (box.type !== 'MANGA' && box.type !== 'NAP'))
            return null;
        const sheet = await this.table.build(box.type, id);
        return { kind: box.type, id, name: box.name || box.code, sheet };
    }
    cableStops(cableId) {
        if (!this.stops.has(cableId)) {
            this.stops.set(cableId, this.prisma.cableConnection.findMany({
                where: { cableId, cable: { deletedAt: null } },
                orderBy: { sequence: 'asc' },
                select: { elementType: true, elementId: true, sequence: true, fiberFrom: true, fiberTo: true },
            }));
        }
        return this.stops.get(cableId);
    }
    async fiber(id) {
        const known = this.fibers.get(id);
        if (known)
            return known;
        const fiber = await this.prisma.fiber.findUnique({
            where: { id },
            select: { id: true, number: true, color: true, deletedAt: true, cable: { select: { deletedAt: true, cableId: true, cable: { select: { code: true, deletedAt: true } } } } },
        });
        if (!fiber || fiber.deletedAt || fiber.cable.deletedAt || fiber.cable.cable.deletedAt)
            return null;
        const info = { id: fiber.id, cableId: fiber.cable.cableId, cableCode: fiber.cable.cable.code, number: fiber.number, color: fiber.color };
        this.fibers.set(id, info);
        return info;
    }
    partners(device, fiberId) {
        const { terminals } = device.sheet;
        const terminal = terminals.find((t) => t.fibers.some((f) => f.fiberId === fiberId));
        if (!terminal)
            return { terminal: null, partners: [] };
        const related = new Set([terminal]);
        for (const peer of terminal.peers) {
            const match = terminals.find((t) => t.label === peer);
            if (match)
                related.add(match);
        }
        const [portType] = terminal.key.split(':');
        const splitterPeers = new Set();
        if (portType === 'SPLITTER_INPUT' || portType === 'SPLITTER_OUTPUT') {
            const otherSide = portType === 'SPLITTER_INPUT' ? 'SPLITTER_OUTPUT' : 'SPLITTER_INPUT';
            for (const t of terminals) {
                if (t.group === terminal.group && t.key.startsWith(`${otherSide}:`)) {
                    related.add(t);
                    splitterPeers.add(t);
                }
            }
        }
        const partners = [...related].flatMap((t) => t.fibers.filter((f) => f.fiberId !== fiberId).map((f) => ({
            fiberId: f.fiberId, terminal: t, how: splitterPeers.has(t) ? 'splitter' : 'splice',
        })));
        return { terminal, partners };
    }
    async traceFiber(origin, fiberId) {
        const steps = [];
        const visited = new Set();
        let truncated = false;
        const start = await this.fiber(fiberId);
        if (!start)
            return { steps, truncated };
        const visit = (key) => {
            if (visited.has(key))
                return false;
            if (steps.length >= MAX_STEPS) {
                truncated = true;
                return false;
            }
            visited.add(key);
            return true;
        };
        const addStep = (parent, how, device, fiber, portLabel) => {
            const step = {
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
        const travel = async (fiber, device, parent, direction) => {
            const along = (await this.cableStops(fiber.cableId)).filter((s) => fiber.number >= s.fiberFrom && fiber.number <= s.fiberTo);
            const here = along.findIndex((s) => s.elementType === device.kind && s.elementId === device.id);
            if (here < 0)
                return;
            const offsets = direction ? [direction] : [-1, 1];
            for (const offset of offsets) {
                const next = along[here + offset];
                if (!next)
                    continue;
                const nextDevice = await this.device(next.elementType, next.elementId);
                if (!nextDevice || !visit(`arrival:${fiber.id}@${next.elementType}:${next.elementId}:${offset}`))
                    continue;
                const { terminal } = this.partners(nextDevice, fiber.id);
                const step = addStep(parent, 'cable', nextDevice, fiber, terminal?.label ?? null);
                await arrive(fiber, nextDevice, step.id, offset);
            }
        };
        const crossMapping = async (mapping, device, parent, direction) => {
            const next = await this.fiber(direction === 1 ? mapping.outputFiberId : mapping.inputFiberId);
            if (!next || !visit(`mapping:${device.id}:${mapping.id}:${direction}`))
                return;
            const step = addStep(parent, 'splice', device, next, null);
            await travel(next, device, step.id, direction);
        };
        const arrive = async (fiber, device, parent, direction) => {
            const mappings = device.sheet.fiberMappings;
            const from = direction === 1 ? 'inputFiberId' : 'outputFiberId';
            const to = direction === 1 ? 'outputFiberId' : 'inputFiberId';
            const mapping = direction && mappings.find((item) => item[from] === fiber.id);
            if (mapping && direction) {
                await crossMapping(mapping, device, parent, direction);
                return;
            }
            const { terminal, partners } = this.partners(device, fiber.id);
            if (!terminal) {
                if (direction && !mappings.some((item) => item[to] === fiber.id))
                    await travel(fiber, device, parent, direction);
                return;
            }
            for (const partner of partners) {
                const next = await this.fiber(partner.fiberId);
                if (!next || !visit(`port:${partner.fiberId}@${device.kind}:${device.id}:${partner.terminal.key}`))
                    continue;
                const step = addStep(parent, partner.how, device, next, partner.terminal.label);
                await travel(next, device, step.id);
            }
        };
        visited.add(`arrival:${start.id}@${origin.kind}:${origin.id}:1`);
        visited.add(`arrival:${start.id}@${origin.kind}:${origin.id}:-1`);
        const { terminal } = this.partners(origin, start.id);
        const first = addStep(null, 'origin', origin, start, terminal?.label ?? null);
        const input = origin.sheet.fiberMappings.find((mapping) => mapping.inputFiberId === start.id);
        const output = origin.sheet.fiberMappings.find((mapping) => mapping.outputFiberId === start.id);
        if (!input && !output) {
            await travel(start, origin, first.id);
            await arrive(start, origin, first.id);
        }
        if (input) {
            await travel(start, origin, first.id, -1);
            await crossMapping(input, origin, first.id, 1);
        }
        if (output) {
            await travel(start, origin, first.id, 1);
            await crossMapping(output, origin, first.id, -1);
        }
        return { steps, truncated };
    }
}
//# sourceMappingURL=trace.service.js.map