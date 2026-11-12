import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateFiberConfigurationDto } from './dto/update-fiber-configuration.dto.js';
import { SetFiberTerminationsDto, type FiberTerminalDto } from './dto/set-fiber-terminations.dto.js';

// ODF_PORT: una fibra puede empezar/terminar en un ODF, no solo en una manga o caja NAP.
const TERMINATION_TYPES = ['BOX_PORT', 'SPLITTER_INPUT', 'SPLITTER_OUTPUT', 'ODF_PORT'];
const BOX_NODE_TYPES = ['NAP', 'MANGA'];
const TERMINABLE_NODE_TYPES = [...BOX_NODE_TYPES, 'ODF'];

@Injectable()
export class FibersService {
  constructor(private prisma: PrismaService) {}

  private async fiberOrFail(id: string) {
    const fiber = await this.prisma.fiber.findUnique({ where: { id } });
    if (!fiber || fiber.deletedAt) throw new NotFoundException('Hilo de fibra no encontrado');
    return fiber;
  }

  private async terminalsForBox(boxId: string) {
    const box = await this.prisma.box.findUnique({
      where: { id: boxId },
      include: { ports: { where: { deletedAt: null }, orderBy: { number: 'asc' } }, splitters: { where: { deletedAt: null }, include: { ports: { orderBy: [{ portType: 'asc' }, { number: 'asc' }] } } } },
    });
    if (!box || box.deletedAt) return [];
    const options = [
      ...box.ports.map((port) => ({ type: 'BOX_PORT', entityId: port.id, boxId: box.id, portIdentifier: String(port.number), label: `${box.code} · puerto ${port.number}`, status: port.status })),
      ...box.splitters.flatMap((splitter) => splitter.ports.map((port) => ({
        type: port.portType === 'INPUT' ? 'SPLITTER_INPUT' : 'SPLITTER_OUTPUT', entityId: port.id, boxId: box.id,
        portIdentifier: `${splitter.code} ${port.portType === 'INPUT' ? 'IN' : 'OUT'} ${port.number}`,
        label: `${box.code} · ${splitter.code} · ${port.portType === 'INPUT' ? 'entrada' : 'salida'} ${port.number}`, status: port.status,
      }))),
    ];
    const existing = await this.prisma.opticalTermination.findMany({
      where: { entityId: { in: options.map((option) => option.entityId) } },
      select: { id: true, entityId: true },
    });
    const terminationIdByEntityId = new Map(existing.map((termination) => [termination.entityId, termination.id]));
    return options.map((option) => ({ ...option, terminationId: terminationIdByEntityId.get(option.entityId) ?? null }));
  }

  // Terminales disponibles en el dispositivo donde inicia o termina el cable: puertos del ODF, o
  // puertos/splitters de la caja (manga o NAP).
  private terminalsForDevice(type: string | null, id: string) {
    if (type === 'ODF') return this.terminalsForOdf(id);
    if (type && BOX_NODE_TYPES.includes(type)) return this.terminalsForBox(id);
    return Promise.resolve([]);
  }

  private async terminalsForOdf(odfId: string) {
    const odf = await this.prisma.odf.findUnique({ where: { id: odfId }, include: { ports: { orderBy: { number: 'asc' } } } });
    if (!odf || odf.deletedAt) return [];
    const options = odf.ports.map((port) => ({
      type: 'ODF_PORT', entityId: port.id, boxId: odf.id, portIdentifier: String(port.number),
      label: `${odf.code} · puerto ${port.number}`, status: port.status,
    }));
    const existing = await this.prisma.opticalTermination.findMany({
      where: { entityId: { in: options.map((option) => option.entityId) } },
      select: { id: true, entityId: true },
    });
    const terminationIdByEntityId = new Map(existing.map((termination) => [termination.entityId, termination.id]));
    return options.map((option) => ({ ...option, terminationId: terminationIdByEntityId.get(option.entityId) ?? null }));
  }

  async assignmentOptions(cableId: string) {
    const cable = await this.prisma.cable.findUnique({ where: { id: cableId } });
    if (!cable || cable.deletedAt) throw new NotFoundException('Cable no encontrado');
    return {
      source: cable.startNodeId ? await this.terminalsForDevice(cable.startNodeType, cable.startNodeId) : [],
      target: cable.endNodeId ? await this.terminalsForDevice(cable.endNodeType, cable.endNodeId) : [],
    };
  }

  async assignmentsForBox(boxId: string) {
    const terminations = await this.prisma.opticalTermination.findMany({ where: { boxId }, select: { id: true, entityId: true } });
    const terminationById = new Map(terminations.map((termination) => [termination.id, termination.entityId]));
    if (terminationById.size === 0) return [];
    const segments = await this.prisma.fiberSegment.findMany({
      where: { status: 'ACTIVE', OR: [{ startTerminationId: { in: [...terminationById.keys()] } }, { endTerminationId: { in: [...terminationById.keys()] } }] },
      include: { fiber: { include: { cable: { select: { cableId: true, number: true } } } } },
    });
    return segments.flatMap((segment) => [segment.startTerminationId, segment.endTerminationId]
      .filter((terminationId) => terminationById.has(terminationId))
      .map((terminationId) => ({
        entityId: terminationById.get(terminationId), fiberId: segment.fiberId, fiberNumber: segment.fiber.number,
        cableId: segment.fiber.cableId, cableCode: segment.fiber.cable.cableId, color: segment.fiber.color, label: segment.fiber.label,
      })));
  }

  private async resolveTerminal(terminal: FiberTerminalDto) {
    if (!TERMINATION_TYPES.includes(terminal.type)) throw new BadRequestException('Tipo de terminal no permitido');
    if (terminal.type === 'ODF_PORT') {
      const port = await this.prisma.odfPort.findUnique({ where: { id: terminal.entityId } });
      if (!port || port.odfId !== terminal.boxId) throw new BadRequestException('El puerto de ODF seleccionado no es válido');
    } else if (terminal.type === 'BOX_PORT') {
      const port = await this.prisma.boxPort.findUnique({ where: { id: terminal.entityId } });
      if (!port || port.deletedAt || port.boxId !== terminal.boxId) throw new BadRequestException('El puerto de caja seleccionado no es válido');
    } else {
      const port = await this.prisma.splitterPort.findUnique({ where: { id: terminal.entityId }, include: { splitter: true } });
      if (!port || port.splitter.deletedAt || port.splitter.boxId !== terminal.boxId) throw new BadRequestException('El puerto de splitter seleccionado no es válido');
    }
    const existing = await this.prisma.opticalTermination.findFirst({ where: { entityType: terminal.type, entityId: terminal.entityId } });
    if (existing) return existing;
    return this.prisma.opticalTermination.create({
      data: {
        type: terminal.type,
        entityType: terminal.type,
        entityId: terminal.entityId,
        portIdentifier: terminal.portIdentifier,
        ...(terminal.type === 'ODF_PORT' ? { odfId: terminal.boxId } : { boxId: terminal.boxId }),
      },
    });
  }

  async configure(id: string, dto: UpdateFiberConfigurationDto) {
    await this.fiberOrFail(id);
    return this.prisma.fiber.update({ where: { id }, data: { label: dto.label, status: dto.status, attenuationDbPerKm: dto.attenuationDbPerKm, description: dto.description, version: { increment: 1 } } });
  }

  async setTerminations(id: string, dto: SetFiberTerminationsDto) {
    const fiber = await this.fiberOrFail(id);
    const cable = await this.prisma.cable.findUnique({ where: { id: fiber.cableId } });
    if (!cable || cable.deletedAt) throw new NotFoundException('Cable no encontrado');
    if (cable.startNodeId !== dto.source.boxId || !TERMINABLE_NODE_TYPES.includes(cable.startNodeType ?? '')) throw new BadRequestException('El hilo debe salir por un puerto del nodo inicial del cable (ODF, manga o caja NAP)');
    if (cable.endNodeId !== dto.target.boxId || !TERMINABLE_NODE_TYPES.includes(cable.endNodeType ?? '')) throw new BadRequestException('El hilo debe llegar por un puerto del nodo final del cable (ODF, manga o caja NAP)');

    const [source, target] = await Promise.all([this.resolveTerminal(dto.source), this.resolveTerminal(dto.target)]);
    if (source.id === target.id) throw new BadRequestException('El origen y el destino del hilo deben ser distintos');
    const occupied = await this.prisma.fiberSegment.findFirst({
      where: { fiberId: { not: id }, status: 'ACTIVE', OR: [{ startTerminationId: { in: [source.id, target.id] } }, { endTerminationId: { in: [source.id, target.id] } }] },
      include: { fiber: { select: { number: true } } },
    });
    if (occupied) throw new BadRequestException(`El terminal seleccionado ya está asignado al hilo ${occupied.fiber.number} de otro cable`);

    return this.prisma.$transaction(async (tx) => {
      const segment = await tx.fiberSegment.findFirst({ where: { fiberId: id }, orderBy: { createdAt: 'asc' } });
      const saved = segment
        ? await tx.fiberSegment.update({ where: { id: segment.id }, data: { startTerminationId: source.id, endTerminationId: target.id, status: 'ACTIVE' } })
        : await tx.fiberSegment.create({ data: { fiberId: id, startTerminationId: source.id, endTerminationId: target.id, status: 'ACTIVE' } });
      await tx.fiber.update({ where: { id }, data: { status: 'USED', version: { increment: 1 } } });
      return saved;
    });
  }
}
