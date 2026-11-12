import { OpticalConnectionsService } from '../optical-connections/optical-connections.service.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PolesService } from '../poles/poles.service.js';
import type { Prisma } from '@prisma/client';
import { CreateCableDto } from './dto/create-cable.dto.js';
import { UpdateCableDto } from './dto/update-cable.dto.js';
import { UpdateCableConnectionDto } from './dto/update-cable-connection.dto.js';
import {
  CENTER_TOLERANCE_METERS,
  cableTypeFor,
  defaultCableColor,
  DEFAULT_CABLE_CONNECTION,
  defaultFiberRanges,
  POLE_VERTEX_TOLERANCE_METERS,
  fiberColorAt,
  tubeLayout,
} from '../domain/network-rules.js';
import {
  connectionsFromPath,
  nearestWithin,
  snapPathToElements,
  type ConnectionPoint,
  type LocatedElement,
  type SnappedPoint,
} from './cable-geometry.js';

@Injectable()
export class CablesService {
  constructor(private prisma: PrismaService, private poles: PolesService, private opticalConnections: OpticalConnectionsService) {}

  private async resolveProjectId(): Promise<string> {
    let project = await this.prisma.project.findFirst();
    if (!project) {
      project = await this.prisma.project.create({
        data: { code: 'DEF-001', name: 'Proyecto por Defecto' },
      });
    }
    return project.id;
  }

  private async setGeometry(cableId: string, points: Pick<SnappedPoint, 'lat' | 'lng'>[]) {
    const wkt = `LINESTRING(${points.map((p) => `${p.lng} ${p.lat}`).join(',')})`;
    await this.prisma.$executeRaw`
      UPDATE cables
      SET geometry = ST_SetSRID(ST_GeomFromText(${wkt}), 4326),
          "calculatedLengthMeters" = ST_Length(ST_SetSRID(ST_GeomFromText(${wkt}), 4326)::geography)
      WHERE id = ${cableId}
    `;
  }

  // Color de un hilo (por su posición dentro del buffer) o de un buffer (por su número).
  private fiberColor(position: number) {
    return fiberColorAt(position);
  }

  private async createFiberInventory(
    tx: Prisma.TransactionClient,
    cableId: string,
    fiberCount: number,
    fibersPerTube: number,
    tubeCount: number,
  ) {
    const tubes: { id: string }[] = [];
    for (let tubeNumber = 1; tubeNumber <= tubeCount; tubeNumber += 1) {
      tubes.push(await tx.fiberTube.create({
        data: {
          cableId,
          number: tubeNumber,
          color: this.fiberColor(tubeNumber),
          fiberCapacity: fibersPerTube,
        },
      }));
    }

    await tx.fiber.createMany({
      data: Array.from({ length: fiberCount }, (_, index) => {
        const number = index + 1;
        const tubeIndex = Math.floor(index / fibersPerTube);
        return {
          cableId,
          tubeId: tubes[tubeIndex].id,
          number,
          numberInTube: (index % fibersPerTube) + 1,
          color: this.fiberColor((index % fibersPerTube) + 1),
        };
      }),
    });
  }

  // Deja el inventario de la fibra con la estructura estándar de buffers para su cantidad de hilos:
  // crea los buffers y hilos que faltan y reacomoda los existentes SIN cambiarles el id, el número,
  // el estado ni las conexiones (solo cambian de buffer, de posición y de color si el nuevo orden lo pide).
  private async applyInventoryLayout(tx: Prisma.TransactionClient, cableId: string, fiberCount: number) {
    const { fibersPerTube, tubeCount } = tubeLayout(fiberCount);
    const tubes = await tx.fiberTube.findMany({ where: { cableId, deletedAt: null } });
    const tubeByNumber = new Map(tubes.map((tube) => [tube.number, tube]));
    for (let number = 1; number <= tubeCount; number += 1) {
      const existing = tubeByNumber.get(number);
      if (!existing) {
        tubeByNumber.set(number, await tx.fiberTube.create({
          data: { cableId, number, color: this.fiberColor(number), fiberCapacity: fibersPerTube },
        }));
      } else if (existing.fiberCapacity !== fibersPerTube || existing.color !== this.fiberColor(number)) {
        await tx.fiberTube.update({ where: { id: existing.id }, data: { fiberCapacity: fibersPerTube, color: this.fiberColor(number) } });
      }
    }

    const fibers = await tx.fiber.findMany({ where: { cableId, deletedAt: null }, orderBy: { number: 'asc' } });
    const target = (number: number) => {
      const tubeNumber = Math.ceil(number / fibersPerTube);
      const numberInTube = ((number - 1) % fibersPerTube) + 1;
      return { tubeId: tubeByNumber.get(tubeNumber)!.id, numberInTube, color: this.fiberColor(numberInTube) };
    };
    const moving = fibers.filter((fiber) => {
      const t = target(fiber.number);
      return fiber.tubeId !== t.tubeId || fiber.numberInTube !== t.numberInTube || fiber.color !== t.color;
    });
    // Dos pasadas: primero se liberan las posiciones (número negativo, nunca choca) y luego se
    // asignan las definitivas, para que dos hilos que intercambian lugar no choquen entre sí.
    for (const fiber of moving) {
      await tx.fiber.update({ where: { id: fiber.id }, data: { numberInTube: -fiber.number } });
    }
    for (const fiber of moving) {
      await tx.fiber.update({ where: { id: fiber.id }, data: target(fiber.number) });
    }

    const have = new Set(fibers.map((fiber) => fiber.number));
    const missing = Array.from({ length: fiberCount }, (_, index) => index + 1).filter((number) => !have.has(number));
    if (missing.length > 0) {
      await tx.fiber.createMany({ data: missing.map((number) => ({ cableId, number, ...target(number) })) });
    }
    await tx.cable.update({ where: { id: cableId }, data: { tubeCount, fibersPerTube } });
  }

  private async loadElements(): Promise<LocatedElement[]> {
    const [odfs, boxes] = await Promise.all([
      this.prisma.odf.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, latitude: true, longitude: true } }),
      this.prisma.box.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, type: true, latitude: true, longitude: true } }),
    ]);
    return [
      ...odfs.map((o) => ({ kind: 'ODF' as const, id: o.id, code: o.code, name: o.name, lat: Number(o.latitude), lng: Number(o.longitude) })),
      ...boxes.map((b) => ({ kind: (b.type === 'MANGA' ? 'MANGA' : 'NAP') as 'MANGA' | 'NAP', id: b.id, code: b.code, name: b.name, lat: Number(b.latitude), lng: Number(b.longitude) })),
    ];
  }

  // Cada punto del trazado debe ir sobre un poste importado (que se corrige a su centro exacto) o
  // en el centro de un dispositivo: así la fibra va de poste en poste y solo arranca, o pasa, por
  // un ODF o una manga que no están en un poste.
  private async snapPointsToPoles(points: { lat: number; lng: number }[], elements: LocatedElement[]) {
    const hits = await this.poles.nearestTo(points, POLE_VERTEX_TOLERANCE_METERS);
    const offPole: number[] = [];
    const snapped = points.map((point, index) => {
      // Un clic sobre un dispositivo llega con su centro exacto: se respeta tal cual (no se mueve a un poste).
      if (nearestWithin(point, elements, CENTER_TOLERANCE_METERS)) return { lat: point.lat, lng: point.lng };
      const pole = hits[index];
      if (pole) return { lat: pole.lat, lng: pole.lng };
      offPole.push(index + 1);
      return { lat: point.lat, lng: point.lng };
    });
    if (offPole.length > 0) {
      const which = offPole.length === 1 ? `El punto ${offPole[0]}` : `Los puntos ${offPole.join(', ')}`;
      throw new BadRequestException(
        `${which} del trazado no ${offPole.length === 1 ? 'está' : 'están'} en un poste. Cada punto de la fibra debe ir sobre un poste importado (o en el centro de un ODF, una manga o una caja NAP).`,
      );
    }
    return snapped;
  }

  // Ajusta el trazado a los postes y a los centros de los dispositivos que atraviesa, y exige que
  // la fibra comience en el centro de uno de ellos.
  private async resolvePath(points: { lat: number; lng: number }[]) {
    const elements = await this.loadElements();
    const onPoles = await this.snapPointsToPoles(points, elements);
    const path = snapPathToElements(onPoles, elements, CENTER_TOLERANCE_METERS);
    if (path.length < 2) throw new BadRequestException('La fibra necesita al menos dos puntos distintos.');
    if (!path[0].element) {
      throw new BadRequestException('La fibra debe comenzar en el centro de un ODF, una manga o una caja NAP.');
    }
    // La fibra puede empezar, pasar o terminar en cualquier dispositivo (ODF, manga o NAP), en
    // cualquier orden: se conecta a todos los que toque su trazado.
    const connections = connectionsFromPath(path);
    return { path, connections };
  }

  private routeEnds(connections: ConnectionPoint[]) {
    const start = connections.find((c) => c.role === 'START')?.element;
    const end = connections.find((c) => c.role === 'END')?.element;
    return {
      startNodeType: start?.kind ?? null,
      startNodeId: start?.id ?? null,
      endNodeType: end?.kind ?? null,
      endNodeId: end?.id ?? null,
    };
  }

  // Crea, actualiza o elimina las conexiones de la fibra según los dispositivos que atraviesa.
  // Las conexiones que ya existían conservan la configuración que el usuario les dio; las nuevas
  // reciben los hilos por defecto (ver defaultFiberRanges: una NAP toma un hilo y una manga que viene
  // después de dejar hilos en NAPs solo recibe los disponibles).
  private async syncConnections(cableId: string, fiberCount: number, wanted: ConnectionPoint[]) {
    const existing = await this.prisma.cableConnection.findMany({ where: { cableId } });
    const keyOf = (type: string, id: string) => `${type}:${id}`;
    const wantedKeys = new Set(wanted.map((c) => keyOf(c.element.kind, c.element.id)));
    const existingByKey = new Map(existing.map((c) => [keyOf(c.elementType, c.elementId), c]));
    const ordered = [...wanted].sort((a, b) => a.sequence - b.sequence);
    const ranges = defaultFiberRanges(
      ordered.map((c) => {
        const current = existingByKey.get(keyOf(c.element.kind, c.element.id));
        return { kind: c.element.kind, existing: current && { fiberFrom: current.fiberFrom, fiberTo: current.fiberTo } };
      }),
      fiberCount,
    );

    await this.prisma.$transaction([
      ...existing
        .filter((c) => !wantedKeys.has(keyOf(c.elementType, c.elementId)))
        .map((c) => this.prisma.cableConnection.delete({ where: { id: c.id } })),
      ...ordered.map((c, index) => {
        const current = existingByKey.get(keyOf(c.element.kind, c.element.id));
        if (current) {
          return this.prisma.cableConnection.update({
            where: { id: current.id },
            data: { sequence: c.sequence, role: c.role, ...ranges[index] },
          });
        }
        return this.prisma.cableConnection.create({
          data: {
            cableId,
            sequence: c.sequence,
            elementType: c.element.kind,
            elementId: c.element.id,
            role: c.role,
            connectionType: DEFAULT_CABLE_CONNECTION.connectionType,
            ...ranges[index],
            lossDb: DEFAULT_CABLE_CONNECTION.lossDb,
          },
        });
      }),
    ]);
    await this.opticalConnections.assignCablePorts(cableId);
  }

  // Conexiones de cada fibra con los datos del dispositivo (nombre, tipo, ubicación).
  private async connectionsByCable(cableIds: string[]) {
    const rows = cableIds.length
      ? await this.prisma.cableConnection.findMany({ where: { cableId: { in: cableIds } }, orderBy: { sequence: 'asc' } })
      : [];
    const elements = rows.length ? await this.loadElements() : [];
    const byKey = new Map(elements.map((e) => [`${e.kind}:${e.id}`, e]));
    const result = new Map<string, unknown[]>();
    for (const row of rows) {
      const element = byKey.get(`${row.elementType}:${row.elementId}`) ?? null;
      const view = {
        id: row.id,
        sequence: row.sequence,
        role: row.role,
        connectionType: row.connectionType,
        fiberFrom: row.fiberFrom,
        fiberTo: row.fiberTo,
        lossDb: row.lossDb === null ? null : Number(row.lossDb),
        notes: row.notes,
        element: element && { kind: element.kind, id: element.id, code: element.code, name: element.name, lat: element.lat, lng: element.lng },
      };
      result.set(row.cableId, [...(result.get(row.cableId) ?? []), view]);
    }
    return result;
  }

  async create(dto: CreateCableDto) {
    const projectId = await this.resolveProjectId();
    const code = dto.code ?? `FIBRA-${Date.now()}`;
    const { fibersPerTube, tubeCount } = tubeLayout(dto.fiberCount);
    const { path, connections } = await this.resolvePath(dto.points);

    defaultFiberRanges(connections.map((c) => ({ kind: c.element.kind })), dto.fiberCount);

    const cable = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cable.create({
        data: {
          projectId,
          code,
          name: dto.name,
          fiberCount: dto.fiberCount,
          tubeCount,
          fibersPerTube,
          type: cableTypeFor(dto.fiberCount),
          color: dto.color ?? defaultCableColor(dto.fiberCount),
          ...this.routeEnds(connections),
        },
      });
      await this.createFiberInventory(tx, created.id, dto.fiberCount, fibersPerTube, tubeCount);
      return created;
    });

    await this.setGeometry(cable.id, path);
    await this.syncConnections(cable.id, cable.fiberCount, connections);

    return this.findOne(cable.id);
  }

  // Prisma treats PostGIS `geometry` columns as Unsupported and never returns them, so the
  // line coordinates have to be fetched separately as GeoJSON for the frontend to draw them.
  private async attachPath<T extends { id: string }>(cables: T[]): Promise<(T & { path: { lat: number; lng: number }[] })[]> {
    return Promise.all(
      cables.map(async (cable) => {
        const rows = await this.prisma.$queryRaw<{ geojson: string | null }[]>`
          SELECT ST_AsGeoJSON(geometry) as geojson FROM cables WHERE id = ${cable.id}
        `;
        const coordinates: [number, number][] = rows[0]?.geojson
          ? JSON.parse(rows[0].geojson).coordinates
          : [];
        return { ...cable, path: coordinates.map(([lng, lat]) => ({ lat, lng })) };
      }),
    );
  }

  async findAll(query: { projectId?: string } = {}) {
    const cables = await this.prisma.cable.findMany({
      where: { deletedAt: null, projectId: query.projectId },
      orderBy: { createdAt: 'desc' },
    });
    const withPaths = await this.attachPath(cables);
    const connections = await this.connectionsByCable(cables.map((c) => c.id));
    return withPaths.map((cable) => ({ ...cable, deviceConnections: connections.get(cable.id) ?? [] }));
  }

  async findOne(id: string) {
    const cable = await this.prisma.cable.findUnique({ where: { id } });
    if (!cable || cable.deletedAt) throw new NotFoundException('Cable no encontrado');
    const [withPath] = await this.attachPath([cable]);
    const connections = await this.connectionsByCable([id]);
    return { ...withPath, deviceConnections: connections.get(id) ?? [] };
  }

  async updateConnection(cableId: string, connectionId: string, dto: UpdateCableConnectionDto) {
    const connection = await this.prisma.cableConnection.findFirst({ where: { id: connectionId, cableId } });
    if (!connection) throw new NotFoundException('Conexión no encontrada');
    const cable = await this.prisma.cable.findUnique({ where: { id: cableId } });
    if (!cable || cable.deletedAt) throw new NotFoundException('Cable no encontrado');

    const fiberFrom = dto.fiberFrom ?? connection.fiberFrom;
    const fiberTo = dto.fiberTo ?? connection.fiberTo;
    if (fiberTo > cable.fiberCount) {
      throw new BadRequestException(`Esta fibra solo tiene ${cable.fiberCount} hilos.`);
    }
    if (fiberFrom > fiberTo) {
      throw new BadRequestException('El primer hilo no puede ser mayor que el último.');
    }

    await this.prisma.cableConnection.update({
      where: { id: connectionId },
      data: { connectionType: dto.connectionType, fiberFrom, fiberTo, lossDb: dto.lossDb, notes: dto.notes },
    });
    return this.findOne(cableId);
  }

  async initializeFibers(id: string) {
    const cable = await this.prisma.cable.findUnique({ where: { id } });
    if (!cable || cable.deletedAt) throw new NotFoundException('Cable no encontrado');

    const existingFibers = await this.prisma.fiber.count({ where: { cableId: id, deletedAt: null } });
    if (existingFibers === 0) {
      await this.prisma.$transaction(async (tx) => {
        const tubes = await tx.fiberTube.findMany({ where: { cableId: id, deletedAt: null }, orderBy: { number: 'asc' } });
        if (tubes.length === 0) {
          await this.createFiberInventory(tx, id, cable.fiberCount, cable.fibersPerTube, cable.tubeCount);
          return;
        }
        await tx.fiber.createMany({
          data: Array.from({ length: cable.fiberCount }, (_, index) => {
            const number = index + 1;
            const tubeIndex = Math.min(Math.floor(index / cable.fibersPerTube), tubes.length - 1);
            return {
              cableId: id,
              tubeId: tubes[tubeIndex].id,
              number,
              numberInTube: (index % cable.fibersPerTube) + 1,
              color: this.fiberColor((index % cable.fibersPerTube) + 1),
            };
          }),
          skipDuplicates: true,
        });
      });
    }
    return this.inspection(id);
  }

  async inspection(id: string) {
    const cable = await this.prisma.cable.findUnique({
      where: { id },
      include: {
        tubes: {
          where: { deletedAt: null },
          orderBy: { number: 'asc' },
          include: {
            fibers: {
              where: { deletedAt: null },
              orderBy: { number: 'asc' },
              include: { segments: true },
            },
          },
        },
      },
    });
    if (!cable || cable.deletedAt) throw new NotFoundException('Cable no encontrado');

    const fibers = cable.tubes.flatMap((tube) => tube.fibers.map((fiber) => ({ ...fiber, tube })));
    const terminationIds = [...new Set(fibers.flatMap((fiber) => fiber.segments.flatMap((segment) => [segment.startTerminationId, segment.endTerminationId])))]
      .filter((terminationId): terminationId is string => !!terminationId);
    const terminations = terminationIds.length === 0
      ? []
      : await this.prisma.opticalTermination.findMany({
          where: { id: { in: terminationIds } },
          select: {
            id: true,
            type: true,
            entityType: true,
            entityId: true,
            portIdentifier: true,
            box: { select: { code: true, name: true } },
            odf: { select: { code: true, name: true } },
          },
        });
    const terminationById = new Map(terminations.map((termination) => [termination.id, termination]));
    const fiberNumbersByTerminationId = new Map<string, Set<number>>();
    for (const fiber of fibers) {
      for (const segment of fiber.segments) {
        for (const terminationId of [segment.startTerminationId, segment.endTerminationId]) {
          const numbers = fiberNumbersByTerminationId.get(terminationId) ?? new Set<number>();
          numbers.add(fiber.number);
          fiberNumbersByTerminationId.set(terminationId, numbers);
        }
      }
    }
    const splitterTerminations = terminations.filter((termination) =>
      termination.entityType === 'SPLITTER_INPUT' || termination.entityType === 'SPLITTER_OUTPUT',
    );
    const splitterPorts = splitterTerminations.length === 0
      ? []
      : await this.prisma.splitterPort.findMany({
          where: { id: { in: splitterTerminations.map((termination) => termination.entityId) } },
          include: { splitter: { include: { box: { select: { code: true, name: true } } } } },
        });
    const splitterById = new Map<string, {
      id: string;
      code: string;
      name: string | null;
      ratio: string;
      status: string;
      box: { code: string; name: string | null } | null;
      linkedFibers: Set<number>;
      linkedPorts: { type: string; number: number; status: string }[];
    }>();
    for (const port of splitterPorts) {
      const splitter = splitterById.get(port.splitterId) ?? {
        id: port.splitter.id,
        code: port.splitter.code,
        name: port.splitter.name,
        ratio: port.splitter.ratio,
        status: port.splitter.status,
        box: port.splitter.box,
        linkedFibers: new Set<number>(),
        linkedPorts: [],
      };
      const termination = splitterTerminations.find((item) => item.entityId === port.id);
      for (const fiberNumber of termination ? fiberNumbersByTerminationId.get(termination.id) ?? [] : []) {
        splitter.linkedFibers.add(fiberNumber);
      }
      splitter.linkedPorts.push({ type: port.portType, number: port.number, status: port.status });
      splitterById.set(port.splitterId, splitter);
    }
    const describeTermination = (terminationId: string) => {
      const termination = terminationById.get(terminationId);
      if (!termination) return { id: terminationId, label: 'Terminal no disponible' };
      const container = termination.box ?? termination.odf;
      return {
        id: termination.id,
        label: container
          ? `${container.code}${termination.portIdentifier ? ` · puerto ${termination.portIdentifier}` : ''}`
          : termination.portIdentifier ?? `${termination.type}: ${termination.entityId}`,
        type: termination.type,
      };
    };

    return {
      cable: {
        id: cable.id,
        code: cable.code,
        name: cable.name,
        type: cable.type,
        fiberCount: cable.fiberCount,
        tubeCount: cable.tubeCount,
        fibersPerTube: cable.fibersPerTube,
        status: cable.status,
        color: cable.color,
        calculatedLengthMeters: cable.calculatedLengthMeters,
      },
      deviceConnections: (await this.connectionsByCable([id])).get(id) ?? [],
      inventoryReady: fibers.length > 0,
      connectedSplitters: [...splitterById.values()].map((splitter) => ({
        ...splitter,
        linkedFibers: [...splitter.linkedFibers].sort((a, b) => a - b),
        linkedPorts: splitter.linkedPorts.sort((a, b) => a.type.localeCompare(b.type) || a.number - b.number),
      })),
      fibers: fibers.map((fiber) => ({
        id: fiber.id,
        number: fiber.number,
        numberInTube: fiber.numberInTube,
        color: fiber.color,
        label: fiber.label,
        status: fiber.status,
        attenuationDbPerKm: fiber.attenuationDbPerKm,
        description: fiber.description,
        tube: { number: fiber.tube.number, color: fiber.tube.color, label: fiber.tube.label },
        connections: fiber.segments.map((segment) => ({
          id: segment.id,
          status: segment.status,
          lengthMeters: segment.lengthMeters,
          lossDb: segment.calculatedLossDb,
          from: describeTermination(segment.startTerminationId),
          to: describeTermination(segment.endTerminationId),
        })),
      })),
    };
  }

  async update(id: string, dto: UpdateCableDto) {
    const current = await this.findOne(id);
    if (dto.fiberCount !== undefined && dto.fiberCount < current.fiberCount) {
      throw new BadRequestException(`Una fibra solo se puede ampliar: tiene ${current.fiberCount} hilos y no se puede pasar a ${dto.fiberCount}.`);
    }
    const resizing = dto.fiberCount !== undefined && dto.fiberCount !== current.fiberCount;
    const layout = dto.fiberCount ? tubeLayout(dto.fiberCount) : undefined;
    const resolved = dto.points?.length ? await this.resolvePath(dto.points) : undefined;

    // Cambiar el nombre (código) de la fibra: no puede quedar vacío ni repetir el de otra fibra.
    const newCode = dto.code?.trim();
    if (dto.code !== undefined) {
      if (!newCode) throw new BadRequestException('El nombre de la fibra no puede quedar vacío.');
      if (newCode !== current.code) {
        const taken = await this.prisma.cable.findFirst({ where: { code: newCode, projectId: current.projectId, id: { not: id } } });
        if (taken) throw new ConflictException(`Ya existe una fibra con el nombre "${newCode}".`);
      }
    }

    if (resolved) {
      const existing = await this.prisma.cableConnection.findMany({ where: { cableId: id } });
      defaultFiberRanges([...resolved.connections].sort((a, b) => a.sequence - b.sequence).map((c) => ({
        kind: c.element.kind,
        existing: existing.find((row) => row.elementType === c.element.kind && row.elementId === c.element.id),
      })), dto.fiberCount ?? current.fiberCount);
    }

    const updated = await this.prisma.cable.update({
      where: { id },
      data: {
        code: newCode,
        name: dto.name,
        status: dto.status,
        description: dto.description,
        // Si no se eligió un color y la fibra seguía con el color estándar de su cantidad de hilos,
        // al cambiar los hilos pasa al color estándar de la nueva cantidad.
        color:
          dto.color ??
          (dto.fiberCount && dto.fiberCount !== current.fiberCount && current.color === defaultCableColor(current.fiberCount)
            ? defaultCableColor(dto.fiberCount)
            : undefined),
        fiberCount: dto.fiberCount,
        type: dto.fiberCount ? cableTypeFor(dto.fiberCount) : undefined,
        tubeCount: layout?.tubeCount,
        fibersPerTube: layout?.fibersPerTube,
        ...(resolved ? this.routeEnds(resolved.connections) : {}),
        version: { increment: 1 },
      },
    });

    if (resolved) {
      await this.setGeometry(id, resolved.path);
      await this.syncConnections(id, updated.fiberCount, resolved.connections);
    }

    if (resizing) {
      // Ampliación: se agregan los buffers e hilos nuevos y se conservan los que ya existían. Las
      // conexiones que cubrían todos los hilos pasan a cubrir también los nuevos.
      await this.prisma.$transaction(
        async (tx) => {
          await this.applyInventoryLayout(tx, id, dto.fiberCount!);
          await tx.cableConnection.updateMany({
            where: { cableId: id, fiberFrom: 1, fiberTo: current.fiberCount },
            data: { fiberTo: dto.fiberCount! },
          });
        },
        { timeout: 20_000 },
      );
    }

    return this.findOne(id);
  }

  // Reacomoda los buffers de una fibra existente a la estructura estándar de su cantidad de hilos.
  async relayoutInventory(id: string) {
    const cable = await this.findOne(id);
    await this.prisma.$transaction((tx) => this.applyInventoryLayout(tx, id, cable.fiberCount), { timeout: 20_000 });
  }

  // Recalcula las conexiones con dispositivos a partir del trazado actual (útil para fibras
  // creadas antes de que existieran las conexiones automáticas).
  async reconnect(id: string) {
    const cable = await this.findOne(id);
    try {
      return await this.update(id, { points: cable.path.map(({ lat, lng }) => ({ lat, lng })) });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new BadRequestException(`${error.message} Usa «Modificar trazado» para acomodar el inicio de la fibra.`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    // Una fibra eliminada deja de estar conectada a los dispositivos que atravesaba.
    const [, removed] = await this.prisma.$transaction([
      this.prisma.cableConnection.deleteMany({ where: { cableId: id } }),
      this.prisma.cable.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    return removed;
  }
}
