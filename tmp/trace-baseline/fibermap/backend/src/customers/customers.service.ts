import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { CheckViabilityDto } from './dto/check-viability.dto.js';

// Typical maximum drop-cable reach from a caja NAP to a subscriber's premises.
const DEFAULT_MAX_DISTANCE_METERS = 250;

interface NearestBoxRow {
  id: string;
  code: string;
  name: string | null;
  portCapacity: number;
  capacity: number | null;
  usedPorts: number;
  latitude: unknown;
  longitude: unknown;
  distanceMeters: number;
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    if (projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      return projectId;
    }
    let project = await this.prisma.project.findFirst({ where: { deletedAt: null } });
    if (!project) {
      project = await this.prisma.project.create({
        data: { code: 'DEF-001', name: 'Proyecto por Defecto' },
      });
    }
    return project.id;
  }

  private async findNearestBox(projectId: string, lat: number, lng: number): Promise<NearestBoxRow | null> {
    const rows = await this.prisma.$queryRaw<NearestBoxRow[]>`
      SELECT id, code, name, "portCapacity", capacity, "usedPorts", latitude, longitude,
        ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS "distanceMeters"
      FROM boxes
      WHERE "projectId" = ${projectId} AND "deletedAt" IS NULL AND type = 'NAP' AND geometry IS NOT NULL
      ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async checkViability(dto: CheckViabilityDto) {
    const projectId = await this.resolveProjectId(dto.projectId);
    const maxDistance = dto.maxDistanceMeters ?? DEFAULT_MAX_DISTANCE_METERS;
    const nearest = await this.findNearestBox(projectId, dto.lat, dto.lng);

    if (!nearest) {
      return {
        viable: false,
        reason: 'No hay cajas de red registradas en el proyecto.',
        nearestBox: null,
        distanceMeters: null,
        portsAvailable: null,
      };
    }

    const distanceMeters = Math.round(Number(nearest.distanceMeters) * 100) / 100;
    const withinRange = distanceMeters <= maxDistance;
    // A box without generated ports is not unlimited. Until its physical capacity is known
    // (or ports have been generated), it must not be offered as commercially available.
    const totalPorts = nearest.portCapacity > 0 ? nearest.portCapacity : (nearest.capacity ?? 0);
    const portsAvailable = Math.max(0, totalPorts - nearest.usedPorts);
    const hasCapacity = portsAvailable > 0;
    const viable = withinRange && hasCapacity;

    return {
      viable,
      distanceMeters,
      maxDistanceMeters: maxDistance,
      withinRange,
      portsAvailable,
      reason: !withinRange
        ? `La caja más cercana está a ${Math.round(distanceMeters)}m, fuera del rango de cobertura (${maxDistance}m).`
        : !hasCapacity
          ? 'La caja más cercana no tiene puertos disponibles.'
          : null,
      nearestBox: {
        id: nearest.id,
        code: nearest.code,
        name: nearest.name,
        latitude: Number(nearest.latitude),
        longitude: Number(nearest.longitude),
      },
    };
  }

  async create(dto: CreateCustomerDto) {
    const projectId = await this.resolveProjectId(dto.projectId);
    const viability = await this.checkViability({ lat: dto.latitude, lng: dto.longitude, projectId });

    const customer = await this.prisma.customer.create({
      data: {
        projectId,
        code: dto.code,
        name: dto.name,
        documentId: dto.documentId,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        notes: dto.notes,
        status: viability.viable ? 'VIABLE' : 'NOT_VIABLE',
        nearestBoxId: viability.nearestBox?.id,
        distanceToBoxMeters: viability.distanceMeters ?? undefined,
      },
    });

    await this.prisma.$executeRaw`
      UPDATE customers
      SET geometry = ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326)
      WHERE id = ${customer.id}
    `;

    return { ...customer, viability };
  }

  findAll(query: { projectId?: string; status?: string; search?: string } = {}) {
    const { projectId, status, search } = query;
    const where: Record<string, unknown> = { deletedAt: null };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { nearestBox: true },
    });
    if (!customer || customer.deletedAt) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.findOne(id);

    const nextLat = dto.latitude ?? Number(existing.latitude);
    const nextLng = dto.longitude ?? Number(existing.longitude);
    const locationChanged = dto.latitude !== undefined || dto.longitude !== undefined;

    let viability: Awaited<ReturnType<CustomersService['checkViability']>> | undefined;
    if (locationChanged) {
      viability = await this.checkViability({
        lat: nextLat,
        lng: nextLng,
        projectId: existing.projectId,
      });
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        documentId: dto.documentId,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        notes: dto.notes,
        status: dto.status ?? (viability ? (viability.viable ? 'VIABLE' : 'NOT_VIABLE') : undefined),
        nearestBoxId: viability ? (viability.nearestBox?.id ?? null) : undefined,
        distanceToBoxMeters: viability ? (viability.distanceMeters ?? null) : undefined,
      },
    });

    if (locationChanged) {
      await this.prisma.$executeRaw`
        UPDATE customers
        SET geometry = ST_SetSRID(ST_MakePoint(${nextLng}, ${nextLat}), 4326)
        WHERE id = ${id}
      `;
    }

    return customer;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }
}
