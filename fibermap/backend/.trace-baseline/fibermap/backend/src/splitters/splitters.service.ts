import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateSplitterDto } from './dto/update-splitter.dto.js';
import { CreateSplitterDto } from './dto/create-splitter.dto.js';
import { OpticalConnectionsService } from '../optical-connections/optical-connections.service.js';
import { NAP_MAX_SPLITTER_OUTPUTS, splitterOutputs } from '../domain/network-rules.js';

@Injectable()
export class SplittersService {
  constructor(
    private prisma: PrismaService,
    private opticalConnections: OpticalConnectionsService,
  ) {}

  async calculateSplitterOccupation(id: string) {
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

  // Una manga de distribución puede organizar varios splitters 1:8 o 1:16; cada uno recibe una
  // fibra por su entrada y entrega sus propias salidas. Las mangas de paso/empalme no dividen la
  // señal. Una caja NAP suma como máximo 16 salidas: un 1:16, o uno o dos 1:8. `ignoreSplitterId`
  // excluye al splitter que se está modificando (al ampliarlo de 1:8 a 1:16).
  private async assertRatioAllowed(box: { id: string; type: string; mangaType: string | null }, ratio: string, ignoreSplitterId?: string) {
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
      throw new BadRequestException(
        `Una caja NAP puede tener un splitter 1:16, o uno o dos 1:8 (máximo ${NAP_MAX_SPLITTER_OUTPUTS} salidas). Esta caja ya tiene ${used} salida(s), no cabe un ${ratio}.`,
      );
    }
  }

  // La capacidad de una NAP es la suma de las salidas de sus splitters.
  private async syncNapCapacity(boxId: string) {
    const box = await this.prisma.box.findUnique({ where: { id: boxId }, select: { type: true } });
    if (box?.type !== 'NAP') return;
    const { _sum } = await this.prisma.splitter.aggregate({ where: { boxId, deletedAt: null }, _sum: { outputCount: true } });
    await this.prisma.box.update({ where: { id: boxId }, data: { capacity: _sum.outputCount ?? 0 } });
  }

  async create(dto: CreateSplitterDto) {
    const box = await this.prisma.box.findUnique({ where: { id: dto.boxId } });
    if (!box || box.deletedAt) throw new NotFoundException('Caja no encontrada');
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
            // Crear un splitter solo instala sus puertos libres; nunca crea conexiones ópticas ni
            // asigna hilos. La entrada y cada salida se conectan explícitamente después.
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

  findAll(query: { boxId?: string } = {}) {
    return this.prisma.splitter.findMany({
      where: { deletedAt: null, boxId: query.boxId, box: { deletedAt: null } },
      include: {
        ports: true,
        box: { select: { id: true, code: true, type: true, mangaType: true, latitude: true, longitude: true } },
      },
    });
  }

  async findOne(id: string) {
    const splitter = await this.prisma.splitter.findUnique({
      where: { id },
      include: { ports: true },
    });
    if (!splitter || splitter.deletedAt) throw new NotFoundException('Splitter no encontrado');
    return splitter;
  }

  async update(id: string, dto: UpdateSplitterDto) {
    const current = await this.prisma.splitter.findUnique({ where: { id }, include: { ports: true, box: true } });
    if (!current || current.deletedAt) throw new NotFoundException('Splitter no encontrado');

    let outputCount = current.outputCount;
    if (dto.ratio && dto.ratio !== current.ratio) {
      if (current.box) await this.assertRatioAllowed(current.box, dto.ratio, id);
      const target = splitterOutputs(dto.ratio);
      const outputs = current.ports.filter((port) => port.portType === 'OUTPUT');
      if (target > outputs.length) {
        // Ampliación (p. ej. 1:8 → 1:16): se agregan salidas y se conservan las existentes con su estado.
        const last = Math.max(0, ...outputs.map((port) => port.number));
        await this.prisma.splitterPort.createMany({
          data: Array.from({ length: target - last }, (_, i) => ({ splitterId: id, portType: 'OUTPUT', number: last + i + 1 })),
        });
        outputCount = target;
      } else {
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
    if (current.boxId) await this.syncNapCapacity(current.boxId);
    return updated;
  }

  // Si el splitter tiene fusiones activas, solo se elimina con `force` (el usuario ya confirmó): se
  // eliminan antes esas fusiones (liberando el puerto del otro extremo), para que no queden
  // conexiones colgando de un splitter que ya no existe.
  async remove(id: string, force = false) {
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
      throw new ConflictException(
        `El splitter ${splitter.code} tiene ${connections.length} conexión(es) activa(s). Si lo eliminas, también se eliminarán esas fusiones.`,
      );
    }
    for (const connection of connections) await this.opticalConnections.remove(connection.id);
    const removed = await this.prisma.splitter.update({ where: { id }, data: { deletedAt: new Date() } });
    if (splitter.boxId) await this.syncNapCapacity(splitter.boxId);
    return removed;
  }
}
