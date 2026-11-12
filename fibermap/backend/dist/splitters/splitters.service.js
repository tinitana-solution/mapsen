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
import { OpticalConnectionsService } from '../optical-connections/optical-connections.service.js';
import { NAP_MAX_SPLITTER_OUTPUTS, splitterOutputs } from '../domain/network-rules.js';
let SplittersService = class SplittersService {
    prisma;
    opticalConnections;
    constructor(prisma, opticalConnections) {
        this.prisma = prisma;
        this.opticalConnections = opticalConnections;
    }
    async calculateSplitterOccupation(id) {
        const splitter = await this.prisma.splitter.findUnique({
            where: { id },
            include: {
                ports: true
            }
        });
        if (!splitter) {
            throw new NotFoundException(`Splitter con ID ${id} no encontrado`);
        }
        const totalPorts = splitter.inputCount + splitter.outputCount;
        let usedPorts = 0;
        for (const port of splitter.ports) {
            if (port.status === 'USED' || port.status === 'ACTIVE') {
                usedPorts += 1;
            }
        }
        let occupationPercentage = 0;
        if (totalPorts > 0) {
            occupationPercentage = (usedPorts / totalPorts) * 100;
            occupationPercentage = Math.round(occupationPercentage * 100) / 100;
        }
        return {
            splitterId: id,
            totalPorts,
            usedPorts,
            occupationPercentage
        };
    }
    async assertRatioAllowed(box, ratio, ignoreSplitterId) {
        const others = await this.prisma.splitter.findMany({
            where: { boxId: box.id, deletedAt: null, id: ignoreSplitterId ? { not: ignoreSplitterId } : undefined },
            select: { outputCount: true },
        });
        if (box.type === 'MANGA') {
            if (box.mangaType !== 'DISTRIBUCION') {
                throw new BadRequestException('Solo las mangas de distribución pueden tener splitters');
            }
            return;
        }
        const used = others.reduce((sum, splitter) => sum + splitter.outputCount, 0);
        if (used + splitterOutputs(ratio) > NAP_MAX_SPLITTER_OUTPUTS) {
            throw new BadRequestException(`Una caja NAP puede tener un splitter 1:16, o uno o dos 1:8 (máximo ${NAP_MAX_SPLITTER_OUTPUTS} salidas). Esta caja ya tiene ${used} salida(s), no cabe un ${ratio}.`);
        }
    }
    async syncNapCapacity(boxId) {
        const box = await this.prisma.box.findUnique({ where: { id: boxId }, select: { type: true } });
        if (box?.type !== 'NAP')
            return;
        const { _sum } = await this.prisma.splitter.aggregate({ where: { boxId, deletedAt: null }, _sum: { outputCount: true } });
        await this.prisma.box.update({ where: { id: boxId }, data: { capacity: _sum.outputCount ?? 0 } });
    }
    async create(dto) {
        const box = await this.prisma.box.findUnique({ where: { id: dto.boxId } });
        if (!box || box.deletedAt)
            throw new NotFoundException('Caja no encontrada');
        await this.assertRatioAllowed(box, dto.ratio);
        const outputCount = splitterOutputs(dto.ratio);
        let code = `${box.code}-SPL`;
        for (let n = 2; await this.prisma.splitter.findUnique({ where: { code_projectId: { code, projectId: box.projectId } } }); n++) {
            code = `${box.code}-SPL-${n}`;
        }
        const splitter = await this.prisma.splitter.create({
            data: {
                projectId: box.projectId,
                boxId: box.id,
                code,
                name: dto.name?.trim() || null,
                ratio: dto.ratio,
                splitterType: 'BALANCED',
                inputCount: 1,
                outputCount,
                ports: {
                    create: [
                        { portType: 'INPUT', number: 1, status: 'FREE' },
                        ...Array.from({ length: outputCount }, (_, i) => ({ portType: 'OUTPUT', number: i + 1, status: 'FREE' })),
                    ],
                },
            },
            include: { ports: true },
        });
        await this.syncNapCapacity(box.id);
        return splitter;
    }
    findAll(query = {}) {
        return this.prisma.splitter.findMany({
            where: { deletedAt: null, boxId: query.boxId, box: { deletedAt: null } },
            include: {
                ports: true,
                box: { select: { id: true, code: true, type: true, mangaType: true, latitude: true, longitude: true } },
            },
        });
    }
    async findOne(id) {
        const splitter = await this.prisma.splitter.findUnique({
            where: { id },
            include: { ports: true },
        });
        if (!splitter || splitter.deletedAt)
            throw new NotFoundException('Splitter no encontrado');
        return splitter;
    }
    async update(id, dto) {
        const current = await this.prisma.splitter.findUnique({ where: { id }, include: { ports: true, box: true } });
        if (!current || current.deletedAt)
            throw new NotFoundException('Splitter no encontrado');
        let outputCount = current.outputCount;
        if (dto.ratio && dto.ratio !== current.ratio) {
            if (current.box)
                await this.assertRatioAllowed(current.box, dto.ratio, id);
            const target = splitterOutputs(dto.ratio);
            const outputs = current.ports.filter((port) => port.portType === 'OUTPUT');
            if (target > outputs.length) {
                const last = Math.max(0, ...outputs.map((port) => port.number));
                await this.prisma.splitterPort.createMany({
                    data: Array.from({ length: target - last }, (_, i) => ({ splitterId: id, portType: 'OUTPUT', number: last + i + 1 })),
                });
                outputCount = target;
            }
            else {
                if (current.ports.some((p) => p.status !== 'FREE')) {
                    throw new BadRequestException('No se puede reducir la relación: el splitter tiene puertos en uso.');
                }
                outputCount = target;
                await this.prisma.$transaction([
                    this.prisma.splitterPort.deleteMany({ where: { splitterId: id, portType: 'OUTPUT' } }),
                    this.prisma.splitterPort.createMany({
                        data: Array.from({ length: outputCount }, (_, i) => ({ splitterId: id, portType: 'OUTPUT', number: i + 1 })),
                    }),
                ]);
            }
        }
        const updated = await this.prisma.splitter.update({
            where: { id },
            data: {
                code: dto.code,
                name: dto.name,
                ratio: dto.ratio,
                outputCount,
                status: dto.status,
            },
            include: { ports: true, box: { select: { id: true, code: true, latitude: true, longitude: true } } },
        });
        if (current.boxId)
            await this.syncNapCapacity(current.boxId);
        return updated;
    }
    async remove(id, force = false) {
        const splitter = await this.findOne(id);
        const portIds = splitter.ports.map((port) => port.id);
        const connections = portIds.length
            ? await this.prisma.opticalConnection.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { sourceTermination: { entityType: { in: ['SPLITTER_INPUT', 'SPLITTER_OUTPUT'] }, entityId: { in: portIds } } },
                        { targetTermination: { entityType: { in: ['SPLITTER_INPUT', 'SPLITTER_OUTPUT'] }, entityId: { in: portIds } } },
                    ],
                },
                select: { id: true },
            })
            : [];
        if (connections.length > 0 && !force) {
            throw new ConflictException(`El splitter ${splitter.code} tiene ${connections.length} conexión(es) activa(s). Si lo eliminas, también se eliminarán esas fusiones.`);
        }
        for (const connection of connections)
            await this.opticalConnections.remove(connection.id);
        const removed = await this.prisma.splitter.update({ where: { id }, data: { deletedAt: new Date() } });
        if (splitter.boxId)
            await this.syncNapCapacity(splitter.boxId);
        return removed;
    }
};
SplittersService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        OpticalConnectionsService])
], SplittersService);
export { SplittersService };
//# sourceMappingURL=splitters.service.js.map