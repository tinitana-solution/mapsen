import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Todo puerto es de entrada y salida a la vez: une a lo sumo dos hilos, uno por cada lado (el que
// llega y el que sigue). Vale igual para ODF, splitters, puertos de caja y mangas de paso/empalme.
export const MAX_FIBERS_PER_PORT = 2;

export interface ConnectionsTableFiber {
  // Id real del hilo (Fiber), para poder editarlo (p. ej. registrar su servicio) desde esta tabla.
  id: string;
  number: number;
  numberInTube: number;
  color: string;
  status: string;
  service: string | null;
  description: string | null;
  // Puerto lógico: 1, 2, 3... en el orden en que se listan los hilos de este dispositivo (no es
  // un OdfPort/BoxPort real, es la posición en la hoja de conexiones).
  port: number;
  // Dónde entra este hilo en el dispositivo (p. ej. "Puerto 3", "SPL-1 · Entrada 1"); vacío si no
  // tiene ninguna fusión registrada ahí.
  links: string[];
}

// Un hilo que llega a un puerto del dispositivo (lado derecho de la hoja de conexiones).
export interface DeviceTerminalFiber {
  fiberId: string;
  cableId: string;
  cableCode: string;
  number: number;
  color: string;
  // Enlace hilo → puerto hecho desde la tabla de conexiones (se puede quitar desde ahí).
  linkId?: string;
}

// Unión interna de una manga: hilo de entrada → hilo de salida, sin requerir un puerto físico.
export interface FiberContinuityMapping {
  id: string;
  inputFiberId: string;
  outputFiberId: string;
}

// Un puerto del dispositivo: del ODF, de un splitter (entrada/salida) o de la caja (DROP).
export interface DeviceTerminal {
  key: string;
  group: string;
  label: string;
  status: string;
  splitter?: { id: string; code: string; name: string | null; ratio: string };
  fibers: DeviceTerminalFiber[];
  // Otros puertos con los que está fusionado dentro del dispositivo.
  peers: string[];
  // Fusiones registradas que tocan este terminal, aun si no llevan un hilo asociado.
  connectionIds: string[];
  // Otros dispositivos a los que llega el hilo de este puerto por su fibra (y en qué puerto entra allá,
  // si se registró).
  remote: RemoteEnd[];
}

export interface RemoteEnd {
  deviceType: 'ODF' | 'MANGA' | 'NAP';
  deviceId: string;
  deviceName: string;
  fiberId: string;
  fiberNumber: number;
  cableCode: string;
  portLabel: string | null;
}

// Otro dispositivo al que llega una fibra (además del de esta hoja), con el rango de hilos que le toca.
export interface CableDevice {
  type: 'ODF' | 'MANGA' | 'NAP';
  id: string;
  name: string;
  fiberFrom: number;
  fiberTo: number;
}

export interface ConnectionsTableBuffer {
  number: number;
  color: string;
  fibers: ConnectionsTableFiber[];
}

export interface ConnectionsTableCable {
  cableId: string;
  code: string;
  name: string | null;
  fiberCount: number;
  role: string;
  fiberFrom: number;
  fiberTo: number;
  hasInventory: boolean;
  // Dónde empieza el cable (ODF | MANGA), para detectar en el frontend una fibra que llega a una
  // NAP directo desde un ODF (dato inválido: siempre debe pasar por una manga).
  startNodeType: string | null;
  // Los demás dispositivos que toca esta fibra (para conectar un puerto con otro dispositivo).
  devices: CableDevice[];
  buffers: ConnectionsTableBuffer[];
}

// Hoja de conexiones de un ODF, una manga o una caja NAP: por cada fibra conectada al dispositivo,
// sus hilos (los que le tocan a esa conexión) con puerto, buffer y servicio — igual a las hojas de
// empalme de Excel. Se arma a partir de `cable_connections`, así que sirve para cualquier tipo de
// dispositivo sin duplicar la consulta.
@Injectable()
export class ConnectionsTableService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    elementType: 'ODF' | 'MANGA' | 'NAP',
    elementId: string,
    odfCapacity?: number | null,
    // Compatible con la llamada de instalaciones que aún envían el indicador de mapeo normal.
    // La tabla actual calcula su estado desde las conexiones registradas, por lo que no necesita
    // una segunda estrategia de mapeo.
    includeNormalMapping?: boolean,
  ): Promise<{ portsInUse: number; cables: ConnectionsTableCable[]; terminals: DeviceTerminal[]; fiberMappings: FiberContinuityMapping[] }> {
    void includeNormalMapping;
    // Manga / NAP: las fusiones del Editor de Conexiones dicen a qué puerto llega cada hilo.
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
        devices: [] as CableDevice[],
        buffers,
      };
    });

    const portsInUse = nextPort - 1;
    if (boxSide) {
      await this.attachRemote(elementType, elementId, cables, boxSide.terminals);
      return { portsInUse, cables, terminals: boxSide.terminals, fiberMappings: boxSide.fiberMappings };
    }

    // ODF: los enlaces hechos a mano (hilo → puerto) mandan; el resto de hilos llega por defecto al
    // puerto n según su orden en la hoja, si ese puerto no quedó tomado por un enlace.
    const odfLinks = await this.prisma.opticalConnection.findMany({
      where: { deletedAt: null, sourceTermination: { entityType: 'FIBER', odfId: elementId }, targetTermination: { entityType: 'ODF_PORT' } },
      include: { sourceTermination: true, targetTermination: true },
    });
    const odfPorts = odfLinks.length
      ? await this.prisma.odfPort.findMany({ where: { id: { in: odfLinks.map((link) => link.targetTermination.entityId) } } })
      : [];
    const portNumberById = new Map(odfPorts.map((port) => [port.id, port.number]));
    const explicitPort = new Map<string, { port: number; linkId: string }>();
    for (const link of odfLinks) {
      const number = portNumberById.get(link.targetTermination.entityId);
      if (number) explicitPort.set(link.sourceTermination.entityId, { port: number, linkId: link.id });
    }
    const explicitPerPort = new Map<number, number>();
    for (const value of explicitPort.values()) explicitPerPort.set(value.port, (explicitPerPort.get(value.port) ?? 0) + 1);
    const highestPort = Math.max(odfCapacity ?? 0, portsInUse, ...explicitPerPort.keys());
    const terminals: DeviceTerminal[] = Array.from({ length: highestPort }, (_, index) => ({
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
          // Sin enlace propio, el hilo n queda en el puerto n mientras a ese puerto le quede un lado libre.
          const port = explicit?.port ?? ((explicitPerPort.get(fiber.port) ?? 0) < MAX_FIBERS_PER_PORT ? fiber.port : null);
          fiber.links = port ? [`Puerto ${port}`] : [];
          if (!port) continue;
          const terminal = terminals[port - 1];
          terminal.status = 'USED';
          terminal.fibers.push({ fiberId: fiber.id, cableId: cable.cableId, cableCode: cable.code, number: fiber.number, color: fiber.color, linkId: explicit?.linkId });
          if (explicit?.linkId && !terminal.connectionIds.includes(explicit.linkId)) terminal.connectionIds.push(explicit.linkId);
        }
      }
    }
    await this.attachRemote(elementType, elementId, cables, terminals);
    return { portsInUse, cables, terminals, fiberMappings: [] };
  }

  // Completa `cable.devices` (a qué otros dispositivos llega cada fibra) y `terminal.remote` (a qué
  // dispositivo sigue el hilo de cada puerto y, si se registró, en qué puerto entra allá).
  private async attachRemote(elementType: string, elementId: string, cables: ConnectionsTableCable[], terminals: DeviceTerminal[]) {
    if (cables.length === 0) return;
    // Solo los vecinos directos: sobre cada fibra, el dispositivo inmediatamente anterior y el
    // inmediatamente siguiente a este (según el orden del trazado). Un dispositivo más lejos queda
    // detrás de otro y se conecta desde ese, no desde aquí.
    const onCables = await this.prisma.cableConnection.findMany({
      where: { cableId: { in: cables.map((cable) => cable.cableId) } },
      orderBy: { sequence: 'asc' },
    });
    const others = cables.flatMap((cable) => {
      const along = onCables.filter((c) => c.cableId === cable.cableId);
      const mine = along.filter((c) => c.elementType === elementType && c.elementId === elementId);
      const neighbors = new Set<(typeof along)[number]>();
      for (const own of mine) {
        const before = along.filter((c) => c.sequence < own.sequence && c !== own && !mine.includes(c)).pop();
        const after = along.find((c) => c.sequence > own.sequence && c !== own && !mine.includes(c));
        if (before) neighbors.add(before);
        if (after) neighbors.add(after);
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
        .map((o) => ({ type: o.elementType as CableDevice['type'], id: o.elementId, name: nameById.get(o.elementId)!, fiberFrom: o.fiberFrom, fiberTo: o.fiberTo }));
    }

    // Puertos donde entran esos hilos en los otros dispositivos (enlaces hilo → puerto).
    const fiberIds = terminals.flatMap((t) => t.fibers.map((f) => f.fiberId));
    const remoteLinks = fiberIds.length
      ? await this.prisma.opticalConnection.findMany({
          where: { deletedAt: null, sourceTermination: { entityType: 'FIBER', entityId: { in: fiberIds } } },
          include: { sourceTermination: true, targetTermination: true },
        })
      : [];
    const portLabels = await this.portLabels(remoteLinks.map((l) => l.targetTermination));
    const remotePort = new Map<string, string>();
    for (const link of remoteLinks) {
      const deviceId = link.sourceTermination.boxId ?? link.sourceTermination.odfId;
      const label = portLabels.get(link.targetTermination.id);
      if (deviceId && label) remotePort.set(`${deviceId}:${link.sourceTermination.entityId}`, label);
    }

    const cableById = new Map(cables.map((cable) => [cable.cableId, cable]));
    for (const terminal of terminals) {
      terminal.remote = terminal.fibers.flatMap((fiber) =>
        (cableById.get(fiber.cableId)?.devices ?? [])
          .filter((device) => fiber.number >= device.fiberFrom && fiber.number <= device.fiberTo)
          .map((device) => ({
            deviceType: device.type,
            deviceId: device.id,
            deviceName: device.name,
            fiberId: fiber.fiberId,
            fiberNumber: fiber.number,
            cableCode: fiber.cableCode,
            portLabel: remotePort.get(`${device.id}:${fiber.fiberId}`) ?? null,
          })),
      );
    }
  }

  // Nombre legible del puerto de cada terminación (puerto de ODF, de caja o de splitter).
  private async portLabels(terminations: Array<{ id: string; entityType: string; entityId: string }>) {
    const ids = (type: string) => terminations.filter((t) => t.entityType === type).map((t) => t.entityId);
    const [odfPorts, boxPorts, splitterPorts] = await Promise.all([
      ids('ODF_PORT').length ? this.prisma.odfPort.findMany({ where: { id: { in: ids('ODF_PORT') } } }) : [],
      ids('BOX_PORT').length ? this.prisma.boxPort.findMany({ where: { id: { in: ids('BOX_PORT') } } }) : [],
      [...ids('SPLITTER_INPUT'), ...ids('SPLITTER_OUTPUT')].length
        ? this.prisma.splitterPort.findMany({ where: { id: { in: [...ids('SPLITTER_INPUT'), ...ids('SPLITTER_OUTPUT')] } }, include: { splitter: { select: { code: true } } } })
        : [],
    ]);
    const byEntity = new Map<string, string>([
      ...odfPorts.map((p) => [p.id, `Puerto ${p.number}`] as [string, string]),
      ...boxPorts.map((p) => [p.id, boxPortLabel(p)] as [string, string]),
      ...splitterPorts.map((p) => [p.id, `${p.splitter.code} · Puerto ${splitterPortNumber(p)}`] as [string, string]),
    ]);
    const labels = new Map<string, string>();
    for (const t of terminations) {
      const label = byEntity.get(t.entityId);
      if (label) labels.set(t.id, label);
    }
    return labels;
  }

  // Puertos de una manga o caja NAP (entradas/salidas de sus splitters y puertos de la caja) con los
  // hilos que llegan a cada uno según las fusiones registradas en el Editor de Conexiones.
  private async boxTerminals(boxId: string) {
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

    const terminals: DeviceTerminal[] = [];
    const byKey = new Map<string, DeviceTerminal>();
    const add = (terminal: DeviceTerminal) => { terminals.push(terminal); byKey.set(terminal.key, terminal); };
    for (const splitter of splitters) {
      // La entrada común y cada salida son extremos físicos distintos. Siempre se muestran:
      // la entrada recibe la fibra alimentadora y las salidas continúan hacia otros cables o NAP.
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
    // Toda manga dispone además de posiciones de empalme directo, incluso si es de distribución y
    // tiene splitter. Así una entrada puede continuar a una salida sin atravesar el splitter; este
    // solo se usa cuando realmente se desea derivar la señal. Los puertos se crean al primer uso.
    if (box?.type === 'MANGA') {
      const existing = new Set(ports.map((port) => port.number));
      for (let number = 1; number <= (box.capacity ?? 0); number++) {
        if (existing.has(number)) continue;
        add({ key: `BOX_PORT_NUMBER:${number}`, group: 'Puertos de empalme', label: `Puerto ${number}`, status: 'FREE', fibers: [], peers: [], connectionIds: [], remote: [] });
      }
      terminals.sort((a, b) => portNumberOf(a) - portNumberOf(b));
    }

    const linksByFiber = new Map<string, string[]>();
    const fiberMappings: FiberContinuityMapping[] = [];
    type Fiberish = { id: string; number: number; color: string; cable: { cableId: string; cable: { code: string } } } | null;
    const attach = (terminal: DeviceTerminal | undefined, fiber: Fiberish, linkId?: string) => {
      if (!terminal || !fiber) return;
      if (!terminal.fibers.some((f) => f.fiberId === fiber.id)) {
        terminal.fibers.push({ fiberId: fiber.id, cableId: fiber.cable.cableId, cableCode: fiber.cable.cable.code, number: fiber.number, color: fiber.color, linkId });
      }
      const links = linksByFiber.get(fiber.id) ?? [];
      if (!links.includes(terminal.label)) links.push(terminal.label);
      linksByFiber.set(fiber.id, links);
    };
    for (const connection of connections) {
      const isDirectFiberMapping =
        connection.sourceTermination.entityType === 'FIBER' &&
        connection.targetTermination.entityType === 'FIBER' &&
        Boolean(connection.sourceFiberId) &&
        Boolean(connection.targetFiberId);
      if (isDirectFiberMapping) {
        fiberMappings.push({ id: connection.id, inputFiberId: connection.sourceFiberId!, outputFiberId: connection.targetFiberId! });
        continue;
      }
      const source = byKey.get(`${connection.sourceTermination.entityType}:${connection.sourceTermination.entityId}`);
      const target = byKey.get(`${connection.targetTermination.entityType}:${connection.targetTermination.entityId}`);
      // Cada enlace hilo ↔ puerto se elimina de manera independiente. Una salida de splitter usa la
      // orientación contraria (SPLITTER_OUTPUT → FIBER), por lo que el `linkId` debe conservarse
      // también en el extremo de origen.
      const sourceIsFiber = connection.sourceTermination.entityType === 'FIBER';
      const targetIsFiber = connection.targetTermination.entityType === 'FIBER';
      attach(source, connection.sourceFiber, targetIsFiber ? connection.id : undefined);
      attach(target, connection.targetFiber, sourceIsFiber ? connection.id : undefined);
      if (source && !source.connectionIds.includes(connection.id)) source.connectionIds.push(connection.id);
      if (target && !target.connectionIds.includes(connection.id)) target.connectionIds.push(connection.id);
      if (source && target) {
        source.peers.push(target.label);
        target.peers.push(source.label);
      }
    }
    return { terminals, linksByFiber, fiberMappings };
  }
}

// Un splitter tiene una entrada común y N salidas independientes (1:8 o 1:16).
export function splitterPortNumber(port: { portType: string; number: number }) {
  return port.portType === 'INPUT' ? `entrada ${port.number}` : `salida ${port.number}`;
}

// Los puertos de empalme de una manga de paso/empalme no llevan tipo en el nombre; los DROP de una NAP sí.
export function boxPortLabel(port: { type: string; number: number }) {
  return port.type === 'EMPALME' ? `Puerto ${port.number}` : `Puerto ${port.type} ${port.number}`;
}

function portNumberOf(terminal: DeviceTerminal) {
  return Number(/(\d+)$/.exec(terminal.label)?.[1] ?? 0);
}
