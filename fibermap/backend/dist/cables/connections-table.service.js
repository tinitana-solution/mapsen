var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
export const MAX_FIBERS_PER_PORT = 2;
let ConnectionsTableService = class ConnectionsTableService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async build(elementType, elementId, odfCapacity, includeNormalMapping) {
        void includeNormalMapping;
        const boxSide = elementType === 'ODF' ? null : await this.boxTerminals(elementId);
        const links = await this.prisma.cableConnection.findMany({
            where: { elementType, elementId, cable: { deletedAt: null } },
            orderBy: { cable: { createdAt: 'asc' } },
            include: {
                cable: {
                    include: {
                        tubes: {
                            where: { deletedAt: null },
                            orderBy: { number: 'asc' },
                            include: { fibers: { where: { deletedAt: null }, orderBy: { number: 'asc' } } },
                        },
                    },
                },
            },
        });
        let nextPort = 1;
        const cables = links.map((link) => {
            const buffers = link.cable.tubes
                .map((tube) => ({
                number: tube.number,
                color: tube.color,
                fibers: tube.fibers
                    .filter((fiber) => fiber.number >= link.fiberFrom && fiber.number <= link.fiberTo)
                    .map((fiber) => ({
                    id: fiber.id,
                    number: fiber.number,
                    numberInTube: fiber.numberInTube,
                    color: fiber.color,
                    status: fiber.status,
                    service: fiber.label,
                    description: fiber.description,
                    port: nextPort++,
                    links: boxSide ? (boxSide.linksByFiber.get(fiber.id) ?? []) : [],
                })),
            }))
                .filter((buffer) => buffer.fibers.length > 0);
            return {
                cableId: link.cable.id,
                code: link.cable.code,
                name: link.cable.name,
                fiberCount: link.cable.fiberCount,
                role: link.role,
                fiberFrom: link.fiberFrom,
                fiberTo: link.fiberTo,
                hasInventory: link.cable.tubes.some((tube) => tube.fibers.length > 0),
                startNodeType: link.cable.startNodeType,
                devices: [],
                buffers,
            };
        });
        const portsInUse = nextPort - 1;
        if (boxSide) {
            await this.attachRemote(elementType, elementId, cables, boxSide.terminals);
            return { portsInUse, cables, terminals: boxSide.terminals, fiberMappings: boxSide.fiberMappings };
        }
        const odfLinks = await this.prisma.opticalConnection.findMany({
            where: { deletedAt: null, sourceTermination: { entityType: 'FIBER', odfId: elementId }, targetTermination: { entityType: 'ODF_PORT' } },
            include: { sourceTermination: true, targetTermination: true },
        });
        const odfPorts = odfLinks.length
            ? await this.prisma.odfPort.findMany({ where: { id: { in: odfLinks.map((link) => link.targetTermination.entityId) } } })
            : [];
        const portNumberById = new Map(odfPorts.map((port) => [port.id, port.number]));
        const explicitPort = new Map();
        for (const link of odfLinks) {
            const number = portNumberById.get(link.targetTermination.entityId);
            if (number)
                explicitPort.set(link.sourceTermination.entityId, { port: number, linkId: link.id });
        }
        const explicitPerPort = new Map();
        for (const value of explicitPort.values())
            explicitPerPort.set(value.port, (explicitPerPort.get(value.port) ?? 0) + 1);
        const highestPort = Math.max(odfCapacity ?? 0, portsInUse, ...explicitPerPort.keys());
        const terminals = Array.from({ length: highestPort }, (_, index) => ({
            key: `ODF_PORT:${index + 1}`,
            group: 'Puertos del ODF',
            label: `Puerto ${index + 1}`,
            status: 'FREE',
            fibers: [],
            peers: [],
            connectionIds: [],
            remote: [],
        }));
        for (const cable of cables) {
            for (const buffer of cable.buffers) {
                for (const fiber of buffer.fibers) {
                    const explicit = explicitPort.get(fiber.id);
                    const port = explicit?.port ?? ((explicitPerPort.get(fiber.port) ?? 0) < MAX_FIBERS_PER_PORT ? fiber.port : null);
                    fiber.links = port ? [`Puerto ${port}`] : [];
                    if (!port)
                        continue;
                    const terminal = terminals[port - 1];
                    terminal.status = 'USED';
                    terminal.fibers.push({ fiberId: fiber.id, cableId: cable.cableId, cableCode: cable.code, number: fiber.number, color: fiber.color, linkId: explicit?.linkId });
                    if (explicit?.linkId && !terminal.connectionIds.includes(explicit.linkId))
                        terminal.connectionIds.push(explicit.linkId);
                }
            }
        }
        await this.attachRemote(elementType, elementId, cables, terminals);
        return { portsInUse, cables, terminals, fiberMappings: [] };
    }
    async attachRemote(elementType, elementId, cables, terminals) {
        if (cables.length === 0)
            return;
        const onCables = await this.prisma.cableConnection.findMany({
            where: { cableId: { in: cables.map((cable) => cable.cableId) } },
            orderBy: { sequence: 'asc' },
        });
        const others = cables.flatMap((cable) => {
            const along = onCables.filter((c) => c.cableId === cable.cableId);
            const mine = along.filter((c) => c.elementType === elementType && c.elementId === elementId);
            const neighbors = new Set();
            for (const own of mine) {
                const before = along.filter((c) => c.sequence < own.sequence && c !== own && !mine.includes(c)).pop();
                const after = along.find((c) => c.sequence > own.sequence && c !== own && !mine.includes(c));
                if (before)
                    neighbors.add(before);
                if (after)
                    neighbors.add(after);
            }
            return [...neighbors];
        });
        const odfIds = others.filter((o) => o.elementType === 'ODF').map((o) => o.elementId);
        const boxIds = others.filter((o) => o.elementType !== 'ODF').map((o) => o.elementId);
        const [odfs, boxes] = await Promise.all([
            odfIds.length ? this.prisma.odf.findMany({ where: { id: { in: odfIds }, deletedAt: null }, select: { id: true, code: true, name: true } }) : [],
            boxIds.length ? this.prisma.box.findMany({ where: { id: { in: boxIds }, deletedAt: null }, select: { id: true, code: true, name: true } }) : [],
        ]);
        const nameById = new Map([...odfs, ...boxes].map((d) => [d.id, d.name || d.code]));
        for (const cable of cables) {
            cable.devices = others
                .filter((o) => o.cableId === cable.cableId && nameById.has(o.elementId))
                .map((o) => ({ type: o.elementType, id: o.elementId, name: nameById.get(o.elementId), fiberFrom: o.fiberFrom, fiberTo: o.fiberTo }));
        }
        const fiberIds = terminals.flatMap((t) => t.fibers.map((f) => f.fiberId));
        const remoteLinks = fiberIds.length
            ? await this.prisma.opticalConnection.findMany({
                where: { deletedAt: null, sourceTermination: { entityType: 'FIBER', entityId: { in: fiberIds } } },
                include: { sourceTermination: true, targetTermination: true },
            })
            : [];
        const portLabels = await this.portLabels(remoteLinks.map((l) => l.targetTermination));
        const remotePort = new Map();
        for (const link of remoteLinks) {
            const deviceId = link.sourceTermination.boxId ?? link.sourceTermination.odfId;
            const label = portLabels.get(link.targetTermination.id);
            if (deviceId && label)
                remotePort.set(`${deviceId}:${link.sourceTermination.entityId}`, label);
        }
        const cableById = new Map(cables.map((cable) => [cable.cableId, cable]));
        for (const terminal of terminals) {
            terminal.remote = terminal.fibers.flatMap((fiber) => (cableById.get(fiber.cableId)?.devices ?? [])
                .filter((device) => fiber.number >= device.fiberFrom && fiber.number <= device.fiberTo)
                .map((device) => ({
                deviceType: device.type,
                deviceId: device.id,
                deviceName: device.name,
                fiberId: fiber.fiberId,
                fiberNumber: fiber.number,
                cableCode: fiber.cableCode,
                portLabel: remotePort.get(`${device.id}:${fiber.fiberId}`) ?? null,
            })));
        }
    }
    async portLabels(terminations) {
        const ids = (type) => terminations.filter((t) => t.entityType === type).map((t) => t.entityId);
        const [odfPorts, boxPorts, splitterPorts] = await Promise.all([
            ids('ODF_PORT').length ? this.prisma.odfPort.findMany({ where: { id: { in: ids('ODF_PORT') } } }) : [],
            ids('BOX_PORT').length ? this.prisma.boxPort.findMany({ where: { id: { in: ids('BOX_PORT') } } }) : [],
            [...ids('SPLITTER_INPUT'), ...ids('SPLITTER_OUTPUT')].length
                ? this.prisma.splitterPort.findMany({ where: { id: { in: [...ids('SPLITTER_INPUT'), ...ids('SPLITTER_OUTPUT')] } }, include: { splitter: { select: { code: true } } } })
                : [],
        ]);
        const byEntity = new Map([
            ...odfPorts.map((p) => [p.id, `Puerto ${p.number}`]),
            ...boxPorts.map((p) => [p.id, boxPortLabel(p)]),
            ...splitterPorts.map((p) => [p.id, `${p.splitter.code} · Puerto ${splitterPortNumber(p)}`]),
        ]);
        const labels = new Map();
        for (const t of terminations) {
            const label = byEntity.get(t.entityId);
            if (label)
                labels.set(t.id, label);
        }
        return labels;
    }
    async boxTerminals(boxId) {
        const [box, splitters, ports, connections] = await Promise.all([
            this.prisma.box.findUnique({ where: { id: boxId }, select: { type: true, mangaType: true, capacity: true } }),
            this.prisma.splitter.findMany({
                where: { boxId, deletedAt: null },
                orderBy: { createdAt: 'asc' },
                include: { ports: { orderBy: [{ portType: 'asc' }, { number: 'asc' }] } },
            }),
            this.prisma.boxPort.findMany({ where: { boxId, deletedAt: null }, orderBy: { number: 'asc' } }),
            this.prisma.opticalConnection.findMany({
                where: { deletedAt: null, sourceTermination: { boxId } },
                include: {
                    sourceTermination: true,
                    targetTermination: true,
                    sourceFiber: { include: { cable: { include: { cable: { select: { code: true } } } } } },
                    targetFiber: { include: { cable: { include: { cable: { select: { code: true } } } } } },
                },
            }),
        ]);
        const terminals = [];
        const byKey = new Map();
        const add = (terminal) => { terminals.push(terminal); byKey.set(terminal.key, terminal); };
        for (const splitter of splitters) {
            for (const port of splitter.ports) {
                const isInput = port.portType === 'INPUT';
                add({
                    key: `${isInput ? 'SPLITTER_INPUT' : 'SPLITTER_OUTPUT'}:${port.id}`,
                    group: `Splitter ${splitter.code} (${splitter.ratio})`,
                    label: `${splitter.code} · Puerto ${splitterPortNumber(port)}`,
                    status: port.status,
                    splitter: { id: splitter.id, code: splitter.code, name: splitter.name, ratio: splitter.ratio },
                    fibers: [],
                    peers: [],
                    connectionIds: [],
                    remote: [],
                });
            }
        }
        for (const port of ports) {
            add({ key: `BOX_PORT:${port.id}`, group: 'Puertos de la caja', label: boxPortLabel(port), status: port.status, fibers: [], peers: [], connectionIds: [], remote: [] });
        }
        if (box?.type === 'MANGA') {
            const existing = new Set(ports.map((port) => port.number));
            for (let number = 1; number <= (box.capacity ?? 0); number++) {
                if (existing.has(number))
                    continue;
                add({ key: `BOX_PORT_NUMBER:${number}`, group: 'Puertos de empalme', label: `Puerto ${number}`, status: 'FREE', fibers: [], peers: [], connectionIds: [], remote: [] });
            }
            terminals.sort((a, b) => portNumberOf(a) - portNumberOf(b));
        }
        const linksByFiber = new Map();
        const fiberMappings = [];
        const attach = (terminal, fiber, linkId) => {
            if (!terminal || !fiber)
                return;
            if (!terminal.fibers.some((f) => f.fiberId === fiber.id)) {
                terminal.fibers.push({ fiberId: fiber.id, cableId: fiber.cable.cableId, cableCode: fiber.cable.cable.code, number: fiber.number, color: fiber.color, linkId });
            }
            const links = linksByFiber.get(fiber.id) ?? [];
            if (!links.includes(terminal.label))
                links.push(terminal.label);
            linksByFiber.set(fiber.id, links);
        };
        for (const connection of connections) {
            const isDirectFiberMapping = connection.sourceTermination.entityType === 'FIBER' &&
                connection.targetTermination.entityType === 'FIBER' &&
                Boolean(connection.sourceFiberId) &&
                Boolean(connection.targetFiberId);
            if (isDirectFiberMapping) {
                fiberMappings.push({ id: connection.id, inputFiberId: connection.sourceFiberId, outputFiberId: connection.targetFiberId });
                continue;
            }
            const source = byKey.get(`${connection.sourceTermination.entityType}:${connection.sourceTermination.entityId}`);
            const target = byKey.get(`${connection.targetTermination.entityType}:${connection.targetTermination.entityId}`);
            const sourceIsFiber = connection.sourceTermination.entityType === 'FIBER';
            const targetIsFiber = connection.targetTermination.entityType === 'FIBER';
            attach(source, connection.sourceFiber, targetIsFiber ? connection.id : undefined);
            attach(target, connection.targetFiber, sourceIsFiber ? connection.id : undefined);
            if (source && !source.connectionIds.includes(connection.id))
                source.connectionIds.push(connection.id);
            if (target && !target.connectionIds.includes(connection.id))
                target.connectionIds.push(connection.id);
            if (source && target) {
                source.peers.push(target.label);
                target.peers.push(source.label);
            }
        }
        return { terminals, linksByFiber, fiberMappings };
    }
};
ConnectionsTableService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService])
], ConnectionsTableService);
export { ConnectionsTableService };
export function splitterPortNumber(port) {
    return port.portType === 'INPUT' ? `entrada ${port.number}` : `salida ${port.number}`;
}
export function boxPortLabel(port) {
    return port.type === 'EMPALME' ? `Puerto ${port.number}` : `Puerto ${port.type} ${port.number}`;
}
function portNumberOf(terminal) {
    return Number(/(\d+)$/.exec(terminal.label)?.[1] ?? 0);
}
//# sourceMappingURL=connections-table.service.js.map