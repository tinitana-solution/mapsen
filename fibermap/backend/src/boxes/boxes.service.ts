import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBoxDto, UpdateBoxDto } from './dto/create-box.dto.js';
import { CENTER_TOLERANCE_METERS, NAP_POLE_TOLERANCE_METERS } from '../domain/network-rules.js';
import { closestPointOnPath, connectionsFromPath, distanceMeters, snapPathToElements, type LocatedElement } from '../cables/cable-geometry.js';
import { PolesService } from '../poles/poles.service.js';
import { ConnectionsTableService } from '../cables/connections-table.service.js';

@Injectable()
export class BoxesService {
  constructor(private prisma: PrismaService, private poles: PolesService, private connectionsTable: ConnectionsTableService) {}

  private async assertNapOnPole(lat: number, lng: number) {
    const [pole] = await this.poles.nearestTo([{ lat, lng }], NAP_POLE_TOLERANCE_METERS);
    if (!pole) {
      throw new BadRequestException(
        `Una caja NAP debe ir sobre un poste o a un lado, a menos de ${NAP_POLE_TOLERANCE_METERS} m. No hay ningún poste importado cerca de este punto.`,
      );
    }
  }

  private async assertMangaOnPole(lat: number, lng: number) {
    const [pole] = await this.poles.nearestTo([{ lat, lng }], NAP_POLE_TOLERANCE_METERS);
    if (!pole) throw new BadRequestException(`Esta manga debe estar a menos de ${NAP_POLE_TOLERANCE_METERS} m de un poste. Las mangas de empalme pueden ubicarse fuera de ese rango.`);
  }

  private async projectId() {
    let project = await this.prisma.project.findFirst();
    if (!project) {
      project = await this.prisma.project.create({ data: { code: 'DEF-001', name: 'Proyecto por Defecto' } });
    }
    return project.id;
  }

  async create(dto: CreateBoxDto) {
    if (dto.cableId) {
      if (dto.type !== 'MANGA' || dto.mangaType !== 'EMPALME') throw new BadRequestException('Solo una manga de empalme puede colocarse sobre una fibra.');
      return this.createSpliceOnCable(dto, dto.cableId);
    }
    const projectId = await this.projectId();
    const code = dto.name.trim();
    if (await this.prisma.box.findUnique({ where: { code_projectId: { code, projectId } } })) {
      throw new ConflictException(`Ya existe una caja o manga con el código "${code}"`);
    }

    const isNap = dto.type === 'NAP';
    if (isNap) await this.assertNapOnPole(dto.lat, dto.lng);
    else if (dto.mangaType !== 'EMPALME') await this.assertMangaOnPole(dto.lat, dto.lng);
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

  private async createSpliceOnCable(dto: CreateBoxDto, cableId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ geojson: string | null }>>`
        SELECT ST_AsGeoJSON(geometry) AS geojson FROM cables WHERE id = ${cableId} AND "deletedAt" IS NULL FOR UPDATE
      `;
      const cable = await tx.cable.findUnique({ where: { id: cableId } });
      if (!cable || cable.deletedAt || !rows[0]?.geojson) throw new NotFoundException('Fibra no encontrada o sin trazado');
      const coordinates: [number, number][] = JSON.parse(rows[0].geojson).coordinates;
      const points = coordinates.map(([lng, lat]) => ({ lat, lng }));
      const nearest = closestPointOnPath({ lat: dto.lat, lng: dto.lng }, points);
      if (!nearest || nearest.distance > 10) throw new BadRequestException('La manga debe colocarse sobre el trazado de la fibra seleccionada.');
      const existing = await tx.cableConnection.findMany({ where: { cableId }, orderBy: { sequence: 'asc' } });
      const [boxes, odfs] = await Promise.all([
        tx.box.findMany({ where: { id: { in: existing.filter((c) => c.elementType !== 'ODF').map((c) => c.elementId) }, deletedAt: null } }),
        tx.odf.findMany({ where: { id: { in: existing.filter((c) => c.elementType === 'ODF').map((c) => c.elementId) }, deletedAt: null } }),
      ]);
      const elements: LocatedElement[] = [
        ...boxes.map((box) => ({ kind: box.type as 'MANGA' | 'NAP', id: box.id, code: box.code, name: box.name, lat: Number(box.latitude), lng: Number(box.longitude) })),
        ...odfs.map((odf) => ({ kind: 'ODF' as const, id: odf.id, code: odf.code, name: odf.name, lat: Number(odf.latitude), lng: Number(odf.longitude) })),
      ];
      const oldPath = snapPathToElements(points, elements, CENTER_TOLERANCE_METERS);
      if (connectionsFromPath(oldPath).length !== existing.length) throw new BadRequestException('Revisa las conexiones existentes de la fibra antes de añadir la manga.');
      if (elements.some((element) => distanceMeters(element, nearest.point) <= CENTER_TOLERANCE_METERS)) {
        throw new BadRequestException('Ya existe un dispositivo en este punto de la fibra.');
      }
      const code = dto.name.trim();
      if (await tx.box.findUnique({ where: { code_projectId: { code, projectId: cable.projectId } } })) throw new ConflictException(`Ya existe una caja o manga con el código "${code}"`);
      const box = await tx.box.create({
        data: { code, name: code, type: 'MANGA', mangaType: 'EMPALME', capacity: dto.capacity ?? 12, latitude: nearest.point.lat, longitude: nearest.point.lng, projectId: cable.projectId },
        include: { splitters: true },
      });
      const element: LocatedElement = { kind: 'MANGA', id: box.id, code, name: code, ...nearest.point };
      const vertexIndex = [nearest.segment, nearest.segment + 1]
        .find((index) => distanceMeters(oldPath[index], nearest.point) < 0.02);
      const path = vertexIndex === undefined
        ? [...oldPath.slice(0, nearest.segment + 1), { ...nearest.point, element }, ...oldPath.slice(nearest.segment + 1)]
        : oldPath.map((point, index) => index === vertexIndex ? { ...nearest.point, element } : point);
      const connections = connectionsFromPath(path);
      const previous = new Map(existing.map((connection) => [`${connection.elementType}:${connection.elementId}`, connection]));
      for (const [index, connection] of connections.entries()) {
        const prior = previous.get(`${connection.element.kind}:${connection.element.id}`);
        if (prior) await tx.cableConnection.update({ where: { id: prior.id }, data: { sequence: index, role: connection.role } });
        else await tx.cableConnection.create({ data: { cableId, elementType: 'MANGA', elementId: box.id, sequence: index, role: connection.role, fiberFrom: 1, fiberTo: cable.fiberCount } });
      }
      const wkt = `LINESTRING(${path.map((point) => `${point.lng} ${point.lat}`).join(',')})`;
      await tx.$executeRaw`UPDATE cables SET geometry = ST_SetSRID(ST_GeomFromText(${wkt}), 4326), "calculatedLengthMeters" = ST_Length(ST_SetSRID(ST_GeomFromText(${wkt}), 4326)::geography) WHERE id = ${cableId}`;
      await tx.$executeRaw`UPDATE boxes SET geometry = ST_SetSRID(ST_MakePoint(${nearest.point.lng}, ${nearest.point.lat}), 4326) WHERE id = ${box.id}`;
      return box;
    }, { timeout: 20_000 });
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
    if (box.type === 'MANGA' && (dto.mangaType ?? box.mangaType) !== 'EMPALME' &&
      (dto.latitude !== undefined || dto.longitude !== undefined || dto.mangaType !== undefined)) {
      await this.assertMangaOnPole(dto.latitude ?? Number(box.latitude), dto.longitude ?? Number(box.longitude));
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
