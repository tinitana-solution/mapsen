import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOdfDto, UpdateOdfDto } from './dto/create-odf.dto.js';
import { ConnectionsTableService } from '../cables/connections-table.service.js';

@Injectable()
export class OdfsService {
  constructor(private readonly prisma: PrismaService, private readonly connectionsTable: ConnectionsTableService) {}

  private async projectId() {
    let project = await this.prisma.project.findFirst({ where: { deletedAt: null } });
    if (!project) project = await this.prisma.project.create({ data: { code: 'DEF-001', name: 'Proyecto por Defecto' } });
    return project.id;
  }

  private geometry(id: string, longitude: number, latitude: number) {
    return this.prisma.$executeRaw`UPDATE odfs SET geometry = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) WHERE id = ${id}`;
  }

  async create(dto: CreateOdfDto) {
    const projectId = await this.projectId();
    const code = dto.code?.trim() || dto.name.trim();
    if (await this.prisma.odf.findUnique({ where: { code_projectId: { code, projectId } } })) {
      throw new ConflictException(`Ya existe un ODF con el código "${code}"`);
    }
    const capacity = dto.capacity ?? 24;
    const odf = await this.prisma.odf.create({
      data: {
        code,
        name: dto.name.trim(),
        projectId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        capacity,
        description: dto.description,
        ports: { create: Array.from({ length: capacity }, (_, i) => ({ number: i + 1 })) },
      },
      include: { ports: { orderBy: { number: 'asc' } } },
    });
    await this.geometry(odf.id, dto.longitude, dto.latitude);
    return odf;
  }

  findAll() {
    return this.prisma.odf.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } });
  }

  async findOne(id: string) {
    const odf = await this.prisma.odf.findUnique({
      where: { id },
      include: { ports: { orderBy: { number: 'asc' } } },
    });
    if (!odf || odf.deletedAt) throw new NotFoundException('ODF no encontrado');
    return odf;
  }

  // Hoja de conexiones del ODF, como la de Excel: por cada fibra conectada, sus hilos
  // (Puerto · Hilo · Buffer · Servicio). El puerto es la posición del hilo en la hoja, no un
  // OdfPort real. El servicio es la etiqueta del hilo; sin etiqueta, su estado.
  async table(id: string) {
    const odf = await this.findOne(id);
    const { portsInUse, cables, terminals } = await this.connectionsTable.build('ODF', id, odf.capacity, true);
    return {
      device: { id: odf.id, kind: 'ODF' as const, code: odf.code, name: odf.name, capacity: odf.capacity, status: odf.status },
      portsInUse,
      cables,
      terminals,
    };
  }

  async update(id: string, dto: UpdateOdfDto) {
    const current = await this.findOne(id);
    const updated = await this.prisma.odf.update({
      where: { id },
      data: { name: dto.name?.trim(), latitude: dto.latitude, longitude: dto.longitude, status: dto.status, description: dto.description },
    });
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      await this.geometry(id, dto.longitude ?? Number(current.longitude), dto.latitude ?? Number(current.latitude));
    }
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.odf.update({ where: { id }, data: { deletedAt: new Date(), status: 'REMOVED' } });
  }
}
