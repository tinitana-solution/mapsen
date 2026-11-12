import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBoxDto, UpdateBoxDto } from './dto/create-box.dto.js';
import { NAP_POLE_TOLERANCE_METERS } from '../domain/network-rules.js';
import { PolesService } from '../poles/poles.service.js';
import { ConnectionsTableService } from '../cables/connections-table.service.js';

@Injectable()
export class BoxesService {
  constructor(private prisma: PrismaService, private poles: PolesService, private connectionsTable: ConnectionsTableService) {}

  // Las cajas NAP van sobre un poste importado o a un lado, muy cerca. (Las mangas pueden ir en
  // cualquier sitio: a veces no caben en un poste.)
  private async assertNapOnPole(lat: number, lng: number) {
    const [pole] = await this.poles.nearestTo([{ lat, lng }], NAP_POLE_TOLERANCE_METERS);
    if (!pole) {
      throw new BadRequestException(
        `Una caja NAP debe ir sobre un poste o a un lado, a menos de ${NAP_POLE_TOLERANCE_METERS} m. No hay ningún poste importado cerca de este punto.`,
      );
    }
  }

  private async projectId() {
    let project = await this.prisma.project.findFirst();
    if (!project) {
      project = await this.prisma.project.create({ data: { code: 'DEF-001', name: 'Proyecto por Defecto' } });
    }
    return project.id;
  }

  async create(dto: CreateBoxDto) {
    const projectId = await this.projectId();
    const code = dto.name.trim();
    if (await this.prisma.box.findUnique({ where: { code_projectId: { code, projectId } } })) {
      throw new ConflictException(`Ya existe una caja o manga con el código "${code}"`);
    }

    const isNap = dto.type === 'NAP';
    if (isNap) await this.assertNapOnPole(dto.lat, dto.lng);
    const box = await this.prisma.box.create({
      data: {
        code,
        name: code,
        type: dto.type,
        mangaType: isNap ? null : dto.mangaType,
        // La NAP comienza sin splitter; su capacidad cambia cuando el operador agrega uno.
        capacity: isNap ? 0 : (dto.capacity ?? 12),
        latitude: dto.lat,
        longitude: dto.lng,
        projectId,
      },
      include: { splitters: true },
    });

    await this.prisma.$executeRaw`
      UPDATE boxes
      SET geometry = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)
      WHERE id = ${box.id}
    `;

    return box;
  }

  async findAll() {
    return this.prisma.box.findMany({
      where: { deletedAt: null },
      include: { splitters: { where: { deletedAt: null }, select: { id: true, code: true, ratio: true } } },
    });
  }

  async findOne(id: string) {
    const box = await this.prisma.box.findUnique({
      where: { id },
      include: {
        ports: true,
        splitters: {
          where: { deletedAt: null },
          include: { ports: true }
        },
        opticalTerminations: true
      }
    });
    if (!box || box.deletedAt) throw new NotFoundException('Caja o manga no encontrada');
    return box;
  }

  async update(id: string, dto: UpdateBoxDto) {
    const box = await this.prisma.box.findUnique({ where: { id } });
    if (!box || box.deletedAt) throw new NotFoundException('Elemento no encontrado');

    if ((dto.mangaType !== undefined || dto.capacity !== undefined) && box.type !== 'MANGA') {
      throw new BadRequestException('El tipo de manga y los hilos solo aplican a mangas');
    }
    // Al dejar de ser de distribución, se retira su splitter manual si no tiene puertos en uso.
    if (dto.mangaType && dto.mangaType !== 'DISTRIBUCION' && box.mangaType === 'DISTRIBUCION') {
      const splitters = await this.prisma.splitter.findMany({ where: { boxId: id, deletedAt: null }, include: { ports: true } });
      if (splitters.some((splitter) => splitter.ports.some((port) => port.status !== 'FREE'))) {
        throw new BadRequestException('El splitter de esta manga tiene puertos en uso: libéralos antes de cambiarla a otro tipo.');
      }
      await this.prisma.splitter.updateMany({ where: { boxId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    }

    if (box.type === 'NAP' && (dto.latitude !== undefined || dto.longitude !== undefined)) {
      await this.assertNapOnPole(dto.latitude ?? Number(box.latitude), dto.longitude ?? Number(box.longitude));
    }

    const updated = await this.prisma.box.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        status: dto.status,
        mangaType: dto.mangaType,
        capacity: dto.capacity,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.prisma.$executeRaw`
        UPDATE boxes
        SET geometry = ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326)
        WHERE id = ${id}
      `;
    }

    return updated;
  }

  async remove(id: string) {
    return this.prisma.box.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  // Hoja de conexiones de una manga o caja NAP, igual a la del ODF: por cada fibra conectada, sus
  // hilos (Puerto · Hilo · Buffer · Servicio). El puerto es la posición del hilo en la hoja.
  async table(id: string) {
    const box = await this.findOne(id);
    if (box.type !== 'MANGA' && box.type !== 'NAP') throw new NotFoundException('Solo las mangas y las cajas NAP tienen tabla de conexiones');
    const { portsInUse, cables, terminals, fiberMappings } = await this.connectionsTable.build(box.type as 'MANGA' | 'NAP', id);
    return {
      device: {
        id: box.id,
        kind: box.type as 'MANGA' | 'NAP',
        code: box.code,
        name: box.name,
        mangaType: box.mangaType,
        capacity: box.capacity,
        status: box.status,
      },
      portsInUse,
      cables,
      terminals,
      fiberMappings,
    };
  }

  async generatePorts(id: string, count: number, type: string = 'DROP') {
    const box = await this.prisma.box.findUnique({ where: { id }, include: { ports: true } });
    if (!box || box.deletedAt) throw new NotFoundException('Caja no encontrada');

    const startNumber = box.ports.length;
    const newPorts = Array.from({ length: count }, (_, i) => ({
      boxId: id,
      number: startNumber + i + 1,
      type,
    }));

    await this.prisma.boxPort.createMany({ data: newPorts });

    return this.prisma.box.update({
      where: { id },
      data: { portCapacity: startNumber + count },
      include: { ports: true },
    });
  }
}
