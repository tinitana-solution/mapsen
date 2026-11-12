var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OpticalTopologyValidatorService } from '../optical-topology-validator/optical-topology-validator.service.js';
import { ConnectionsTableService, MAX_FIBERS_PER_PORT, boxPortLabel, splitterPortNumber } from '../cables/connections-table.service.js';
export const FIBER_ENTITY = 'FIBER';
const CONNECTION_INCLUDE = {
    sourceTermination: true,
    targetTermination: true,
    sourceFiber: { select: { id: true, number: true, color: true, label: true } },
    targetFiber: { select: { id: true, number: true, color: true, label: true } },
};
let OpticalConnectionsService = class OpticalConnectionsService {
    prisma;
    topologyValidator;
    connectionsTable;
    constructor(prisma, topologyValidator, connectionsTable) {
        this.prisma = prisma;
        this.topologyValidator = topologyValidator;
        this.connectionsTable = connectionsTable;
    }
    async resolveTermination(type, entityId, boxId) {
        const existing = await this.prisma.opticalTermination.findFirst({
            where: { entityType: type, entityId },
        });
        if (existing)
            return existing;
        return this.prisma.opticalTermination.create({
            data: { type, entityType: type, entityId, boxId },
        });
    }
    setPortStatus(type, entityId, status) {
        if (type === FIBER_ENTITY)
            return Promise.resolve(null);
        if (type === 'ODF_PORT') {
            return this.prisma.odfPort.update({ where: { id: entityId }, data: { status } });
        }
        if (type === 'BOX_PORT') {
            return this.prisma.boxPort.update({ where: { id: entityId }, data: { status } });
        }
        return this.prisma.splitterPort.update({ where: { id: entityId }, data: { status } });
    }
    async createFiberLink(dto) {
        const isOdf = dto.deviceType === 'ODF';
        const device = isOdf
            ? await this.prisma.odf.findUnique({ where: { id: dto.deviceId }, select: { id: true, deletedAt: true } })
            : await this.prisma.box.findUnique({ where: { id: dto.deviceId }, select: { id: true, type: true, deletedAt: true } });
        if (!device || device.deletedAt)
            throw new NotFoundException('Dispositivo no encontrado');
        const fiber = await this.prisma.fiber.findUnique({ where: { id: dto.fiberId }, include: { cable: { include: { cable: { select: { code: true } } } } } });
        if (!fiber || fiber.deletedAt)
            throw new BadRequestException('El hilo no existe');
        const covered = await this.prisma.cableConnection.findFirst({
            where: { cableId: fiber.cable.cableId, elementType: dto.deviceType, elementId: dto.deviceId, fiberFrom: { lte: fiber.number }, fiberTo: { gte: fiber.number } },
        });
        if (!covered)
            throw new BadRequestException(`El hilo ${fiber.number} de ${fiber.cable.cable.code} no llega a este dispositivo.`);
        const separator = dto.terminalKey.indexOf(':');
        const portType = dto.terminalKey.slice(0, separator);
        const portRef = dto.terminalKey.slice(separator + 1);
        let portId;
        let portLabel;
        let storedType = portType;
        if (isOdf) {
            const number = Number(portRef);
            if (portType !== 'ODF_PORT' || !Number.isInteger(number) || number < 1)
                throw new BadRequestException('Puerto del ODF no válido');
            const port = await this.prisma.odfPort.upsert({
                where: { odfId_number: { odfId: dto.deviceId, number } },
                create: { odfId: dto.deviceId, number },
                update: {},
            });
            portId = port.id;
            portLabel = `Puerto ${number}`;
        }
        else if (portType === 'BOX_PORT') {
            const port = await this.prisma.boxPort.findUnique({ where: { id: portRef } });
            if (!port || port.deletedAt || port.boxId !== dto.deviceId)
                throw new BadRequestException('El puerto no es de esta caja');
            portId = port.id;
            portLabel = boxPortLabel(port);
        }
        else if (portType === 'BOX_PORT_NUMBER') {
            const number = Number(portRef);
            const box = await this.prisma.box.findUnique({ where: { id: dto.deviceId }, select: { type: true, mangaType: true, capacity: true } });
            if (box?.type !== 'MANGA' || !Number.isInteger(number) || number < 1 || number > (box.capacity ?? 0)) {
                throw new BadRequestException('Puerto de empalme no válido');
            }
            const port = await this.prisma.boxPort.upsert({
                where: { boxId_number: { boxId: dto.deviceId, number } },
                create: { boxId: dto.deviceId, number, type: 'EMPALME' },
                update: { deletedAt: null },
            });
            portId = port.id;
            portLabel = boxPortLabel(port);
            storedType = 'BOX_PORT';
        }
        else if (portType === 'SPLITTER_INPUT' || portType === 'SPLITTER_OUTPUT') {
            const port = await this.prisma.splitterPort.findUnique({ where: { id: portRef }, include: { splitter: true } });
            if (!port || port.splitter.deletedAt || port.splitter.boxId !== dto.deviceId)
                throw new BadRequestException('El puerto de splitter no es de esta caja');
            portId = port.id;
            portLabel = `${port.splitter.code} · Puerto ${splitterPortNumber(port)}`;
        }
        else {
            throw new BadRequestException('Tipo de puerto no válido');
        }
        const deviceScope = isOdf ? { odfId: dto.deviceId } : { boxId: dto.deviceId };
        const active = await this.prisma.opticalConnection.findMany({
            where: { deletedAt: null, sourceTermination: { entityType: FIBER_ENTITY, ...deviceScope } },
            include: { sourceTermination: true, targetTermination: true, targetFiber: { select: { number: true } } },
        });
        if (active.some((c) => c.sourceTermination.entityId === fiber.id)) {
            throw new ConflictException(`El hilo ${fiber.number} ya está en otro puerto de este dispositivo. Quítalo primero.`);
        }
        const sheet = await this.connectionsTable.build(dto.deviceType, dto.deviceId, isOdf ? (await this.prisma.odf.findUnique({ where: { id: dto.deviceId }, select: { capacity: true } }))?.capacity : null);
        const sheetKey = isOdf ? `ODF_PORT:${Number(portRef)}` : `${storedType}:${portId}`;
        const onPort = sheet.terminals.find((t) => t.key === sheetKey)?.fibers.filter((f) => f.fiberId !== fiber.id) ?? [];
        const portCapacity = storedType === 'SPLITTER_INPUT' || storedType === 'SPLITTER_OUTPUT' ? 1 : MAX_FIBERS_PER_PORT;
        if (onPort.length >= portCapacity) {
            const detail = onPort.map((f) => `${f.cableCode} hilo ${f.number}`).join(' y ');
            throw new ConflictException(portCapacity === 1
                ? `${portLabel} ya tiene su hilo conectado (${detail}). Quítalo primero.`
                : `${portLabel} ya une dos hilos (${detail}). Quita uno primero.`);
        }
        const termination = (entityType, entityId) => this.prisma.opticalTermination.findFirst({ where: { entityType, entityId, ...deviceScope } }).then((existing) => existing ?? this.prisma.opticalTermination.create({ data: { type: entityType === FIBER_ENTITY ? 'FIBER_END' : entityType, entityType, entityId, ...deviceScope } }));
        const [source, target] = await Promise.all([termination(FIBER_ENTITY, fiber.id), termination(storedType, portId)]);
        const connection = await this.prisma.opticalConnection.create({
            data: { sourceTerminationId: source.id, targetTerminationId: target.id, sourceFiberId: fiber.id, targetFiberId: fiber.id, connectionType: 'SPLICE' },
            include: CONNECTION_INCLUDE,
        });
        await this.setPortStatus(storedType, portId, 'USED');
        await this.syncBoxOccupancyForTypes([{ type: storedType, entityId: portId }]);
        return connection;
    }
    async syncBoxOccupancyForTypes(references) {
        const boxPortIds = references.filter((reference) => reference.type === 'BOX_PORT').map((reference) => reference.entityId);
        if (boxPortIds.length === 0)
            return;
        const ports = await this.prisma.boxPort.findMany({
            where: { id: { in: boxPortIds } },
            select: { boxId: true },
        });
        const boxIds = [...new Set(ports.map((port) => port.boxId))];
        await Promise.all(boxIds.map(async (boxId) => {
            const usedPorts = await this.prisma.boxPort.count({
                where: { boxId, deletedAt: null, status: { in: ['USED', 'RESERVED'] } },
            });
            return this.prisma.box.update({ where: { id: boxId }, data: { usedPorts } });
        }));
    }
    async assertFiberAtBox(fiberId, box, side) {
        const fiber = await this.prisma.fiber.findUnique({ where: { id: fiberId } });
        if (!fiber || fiber.deletedAt)
            throw new BadRequestException(`El hilo de ${side} no existe`);
        const covered = await this.prisma.cableConnection.findFirst({
            where: { cableId: fiber.cableId, elementType: box.type, elementId: box.id, fiberFrom: { lte: fiber.number }, fiberTo: { gte: fiber.number } },
        });
        if (covered)
            return fiber;
        const terminations = await this.prisma.opticalTermination.findMany({ where: { boxId: box.id }, select: { id: true } });
        const assigned = await this.prisma.fiberSegment.findFirst({
            where: {
                fiberId,
                status: 'ACTIVE',
                OR: [{ startTerminationId: { in: terminations.map((t) => t.id) } }, { endTerminationId: { in: terminations.map((t) => t.id) } }],
            },
        });
        if (!assigned)
            throw new BadRequestException(`El hilo ${fiber.number} de ${side} no llega a esta caja: ningún cable conectado a ella lo cubre.`);
        return fiber;
    }
    async create(dto) {
        const box = await this.prisma.box.findUnique({ where: { id: dto.boxId }, select: { id: true, type: true, deletedAt: true } });
        if (!box || box.deletedAt)
            throw new NotFoundException('Caja no encontrada');
        if (dto.sourceFiberId)
            await this.assertFiberAtBox(dto.sourceFiberId, box, 'origen');
        if (dto.targetFiberId)
            await this.assertFiberAtBox(dto.targetFiberId, box, 'destino');
        const source = await this.resolveTermination(dto.sourceType, dto.sourceId, dto.boxId);
        const target = await this.resolveTermination(dto.targetType, dto.targetId, dto.boxId);
        await this.topologyValidator.validateNoCycles(source.id, target.id);
        await this.topologyValidator.validateTerminationAvailability(source.id);
        await this.topologyValidator.validateTerminationAvailability(target.id);
        const connection = await this.prisma.opticalConnection.create({
            data: {
                sourceTerminationId: source.id,
                targetTerminationId: target.id,
                sourceFiberId: dto.sourceFiberId ?? null,
                targetFiberId: dto.targetFiberId ?? null,
                connectionType: dto.connectionType ?? 'SPLICE',
                lossDb: dto.lossDb,
                notes: dto.notes,
            },
            include: CONNECTION_INCLUDE,
        });
        await Promise.all([
            this.setPortStatus(dto.sourceType, dto.sourceId, 'USED'),
            this.setPortStatus(dto.targetType, dto.targetId, 'USED'),
        ]);
        await this.syncBoxOccupancyForTypes([
            { type: dto.sourceType, entityId: dto.sourceId },
            { type: dto.targetType, entityId: dto.targetId },
        ]);
        return connection;
    }
    async createFiberSplice(dto) {
        if (dto.sourceFiberId === dto.targetFiberId) {
            throw new BadRequestException('Un hilo no puede conectarse consigo mismo. Elige otro hilo de salida.');
        }
        const box = await this.prisma.box.findUnique({ where: { id: dto.deviceId }, select: { id: true, type: true, deletedAt: true } });
        if (!box || box.deletedAt || box.type !== 'MANGA')
            throw new NotFoundException('Manga no encontrada');
        await this.assertFiberAtBox(dto.sourceFiberId, box, 'entrada');
        await this.assertFiberAtBox(dto.targetFiberId, box, 'salida');
        const [sourceUsed, targetUsed] = await Promise.all([
            this.prisma.opticalConnection.findFirst({
                where: {
                    deletedAt: null,
                    sourceTermination: { entityType: FIBER_ENTITY, boxId: dto.deviceId, entityId: dto.sourceFiberId },
                    targetTermination: { entityType: FIBER_ENTITY, boxId: dto.deviceId },
                },
                select: { id: true },
            }),
            this.prisma.opticalConnection.findFirst({
                where: {
                    deletedAt: null,
                    sourceTermination: { entityType: FIBER_ENTITY, boxId: dto.deviceId },
                    targetTermination: { entityType: FIBER_ENTITY, boxId: dto.deviceId, entityId: dto.targetFiberId },
                },
                select: { id: true },
            }),
        ]);
        if (sourceUsed)
            throw new ConflictException('Este hilo de entrada ya está conectado a una salida.');
        if (targetUsed)
            throw new ConflictException('Este hilo de salida ya recibe una entrada.');
        const fiberTermination = async (fiberId) => {
            const existing = await this.prisma.opticalTermination.findFirst({ where: { entityType: FIBER_ENTITY, entityId: fiberId, boxId: dto.deviceId } });
            return existing ?? this.prisma.opticalTermination.create({ data: { type: 'FIBER_END', entityType: FIBER_ENTITY, entityId: fiberId, boxId: dto.deviceId } });
        };
        const [source, target] = await Promise.all([fiberTermination(dto.sourceFiberId), fiberTermination(dto.targetFiberId)]);
        return this.prisma.opticalConnection.create({
            data: {
                sourceTerminationId: source.id,
                targetTerminationId: target.id,
                sourceFiberId: dto.sourceFiberId,
                targetFiberId: dto.targetFiberId,
                connectionType: 'DIRECT',
            },
            include: CONNECTION_INCLUDE,
        });
    }
    async createFiberSplitterRoute(dto) {
        if (dto.sourceFiberId && dto.sourceFiberId === dto.targetFiberId) {
            throw new BadRequestException('El hilo de entrada y el de salida deben ser distintos.');
        }
        const box = await this.prisma.box.findUnique({ where: { id: dto.deviceId }, select: { id: true, type: true, deletedAt: true } });
        if (!box || box.deletedAt || box.type !== 'MANGA')
            throw new NotFoundException('Manga no encontrada');
        if (dto.sourceFiberId)
            await this.assertFiberAtBox(dto.sourceFiberId, box, 'entrada');
        await this.assertFiberAtBox(dto.targetFiberId, box, 'salida');
        const [inputPort, outputPort] = await Promise.all([
            this.prisma.splitterPort.findUnique({ where: { id: dto.splitterInputPortId }, include: { splitter: true } }),
            this.prisma.splitterPort.findUnique({ where: { id: dto.splitterOutputPortId }, include: { splitter: true } }),
        ]);
        if (!inputPort || !outputPort || inputPort.splitter.deletedAt || outputPort.splitter.deletedAt ||
            inputPort.splitter.boxId !== dto.deviceId || outputPort.splitter.boxId !== dto.deviceId ||
            inputPort.splitterId !== outputPort.splitterId || inputPort.portType !== 'INPUT' || outputPort.portType !== 'OUTPUT') {
            throw new BadRequestException('La entrada y la salida seleccionadas no pertenecen al mismo splitter de esta manga.');
        }
        const [targetUsed, inputConnection, outputUsed] = await Promise.all([
            this.prisma.opticalConnection.findFirst({ where: { deletedAt: null, targetTermination: { entityType: FIBER_ENTITY, entityId: dto.targetFiberId, boxId: dto.deviceId } }, select: { id: true } }),
            this.prisma.opticalConnection.findFirst({
                where: { deletedAt: null, targetTermination: { entityType: 'SPLITTER_INPUT', entityId: inputPort.id, boxId: dto.deviceId } },
                include: { sourceTermination: true },
            }),
            this.prisma.opticalConnection.findFirst({ where: { deletedAt: null, sourceTermination: { entityType: 'SPLITTER_OUTPUT', entityId: outputPort.id, boxId: dto.deviceId } }, select: { id: true } }),
        ]);
        if (targetUsed)
            throw new ConflictException('Este hilo de salida ya recibe una conexión dentro de la manga.');
        if (outputUsed)
            throw new ConflictException(`La salida ${outputPort.number} del splitter ya tiene un hilo conectado.`);
        if (dto.sourceFiberId) {
            const sourceUsed = await this.prisma.opticalConnection.findFirst({
                where: { deletedAt: null, sourceTermination: { entityType: FIBER_ENTITY, entityId: dto.sourceFiberId, boxId: dto.deviceId } },
                select: { id: true },
            });
            if (sourceUsed)
                throw new ConflictException('Este hilo de entrada ya tiene una conexión dentro de la manga.');
            if (inputConnection)
                throw new ConflictException('La entrada del splitter ya tiene un hilo conectado.');
        }
        else if (!inputConnection || inputConnection.sourceTermination.entityType !== FIBER_ENTITY) {
            throw new ConflictException('Primero conecta un hilo de entrada al splitter antes de usar otra salida.');
        }
        return this.prisma.$transaction(async (tx) => {
            const termination = async (entityType, entityId) => {
                const existing = await tx.opticalTermination.findFirst({ where: { entityType, entityId, boxId: dto.deviceId } });
                return existing ?? tx.opticalTermination.create({ data: { type: entityType === FIBER_ENTITY ? 'FIBER_END' : entityType, entityType, entityId, boxId: dto.deviceId } });
            };
            const [input, output, targetFiber] = await Promise.all([
                termination('SPLITTER_INPUT', inputPort.id),
                termination('SPLITTER_OUTPUT', outputPort.id),
                termination(FIBER_ENTITY, dto.targetFiberId),
            ]);
            const createdInputConnection = dto.sourceFiberId
                ? await (async () => {
                    const sourceFiber = await termination(FIBER_ENTITY, dto.sourceFiberId);
                    return tx.opticalConnection.create({
                        data: { sourceTerminationId: sourceFiber.id, targetTerminationId: input.id, sourceFiberId: dto.sourceFiberId, targetFiberId: dto.sourceFiberId, connectionType: 'SPLICE' },
                        include: CONNECTION_INCLUDE,
                    });
                })()
                : null;
            const outputConnection = await tx.opticalConnection.create({
                data: { sourceTerminationId: output.id, targetTerminationId: targetFiber.id, sourceFiberId: dto.targetFiberId, targetFiberId: dto.targetFiberId, connectionType: 'SPLICE' },
                include: CONNECTION_INCLUDE,
            });
            await tx.splitterPort.updateMany({
                where: { id: { in: dto.sourceFiberId ? [inputPort.id, outputPort.id] : [outputPort.id] } },
                data: { status: 'USED' },
            });
            return { inputConnection: createdInputConnection, outputConnection };
        });
    }
    async setNormalMapping(dto) {
        return this.create(dto);
    }
    async assignCablePorts(cableId) {
        return { cableId, assignedPorts: 0, mode: 'DYNAMIC' };
    }
    async findOrCreateTerminationId(entityType, entityId, boxId) {
        if (!['BOX_PORT', 'SPLITTER_INPUT', 'SPLITTER_OUTPUT'].includes(entityType)) {
            throw new BadRequestException('Tipo de terminal no permitido');
        }
        const box = await this.prisma.box.findUnique({ where: { id: boxId } });
        if (!box || box.deletedAt)
            throw new NotFoundException('Caja no encontrada');
        if (entityType === 'BOX_PORT') {
            const port = await this.prisma.boxPort.findUnique({ where: { id: entityId } });
            if (!port || port.deletedAt || port.boxId !== boxId)
                throw new BadRequestException('El puerto de caja seleccionado no es válido');
        }
        else {
            const port = await this.prisma.splitterPort.findUnique({ where: { id: entityId }, include: { splitter: true } });
            if (!port || port.splitter.deletedAt || port.splitter.boxId !== boxId)
                throw new BadRequestException('El puerto de splitter seleccionado no es válido');
        }
        const termination = await this.resolveTermination(entityType, entityId, boxId);
        return { terminationId: termination.id };
    }
    async findAllForBox(boxId) {
        const terminations = await this.prisma.opticalTermination.findMany({
            where: { boxId },
            select: { id: true },
        });
        const terminationIds = terminations.map((t) => t.id);
        if (terminationIds.length === 0)
            return [];
        return this.prisma.opticalConnection.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { sourceTerminationId: { in: terminationIds } },
                    { targetTerminationId: { in: terminationIds } },
                ],
            },
            include: CONNECTION_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const connection = await this.prisma.opticalConnection.findUnique({
            where: { id },
            include: CONNECTION_INCLUDE,
        });
        if (!connection || connection.deletedAt)
            throw new NotFoundException('Conexión no encontrada');
        return connection;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.prisma.opticalConnection.update({
            where: { id },
            data: { status: dto.status, notes: dto.notes },
            include: CONNECTION_INCLUDE,
        });
    }
    async remove(id) {
        const connection = await this.findOne(id);
        const statusAfter = async (terminationId) => (await this.prisma.opticalConnection.count({
            where: { id: { not: id }, deletedAt: null, OR: [{ sourceTerminationId: terminationId }, { targetTerminationId: terminationId }] },
        })) > 0 ? 'USED' : 'FREE';
        await Promise.all([
            this.setPortStatus(connection.sourceTermination.entityType, connection.sourceTermination.entityId, await statusAfter(connection.sourceTerminationId)),
            this.setPortStatus(connection.targetTermination.entityType, connection.targetTermination.entityId, await statusAfter(connection.targetTerminationId)),
        ]);
        await this.syncBoxOccupancyForTypes([
            { type: connection.sourceTermination.entityType, entityId: connection.sourceTermination.entityId },
            { type: connection.targetTermination.entityType, entityId: connection.targetTermination.entityId },
        ]);
        return this.prisma.opticalConnection.update({
            where: { id },
            data: { deletedAt: new Date(), status: 'REMOVED' },
        });
    }
};
OpticalConnectionsService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        OpticalTopologyValidatorService,
        ConnectionsTableService])
], OpticalConnectionsService);
export { OpticalConnectionsService };
//# sourceMappingURL=optical-connections.service.js.map