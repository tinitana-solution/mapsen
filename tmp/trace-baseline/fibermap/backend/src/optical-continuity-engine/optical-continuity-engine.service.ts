import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OpticalContinuityEngineService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ejecuta la traza óptica partiendo desde una terminación óptica específica (ej: Fibra).
   * Utiliza una consulta recursiva (WITH RECURSIVE) en PostgreSQL para encontrar 
   * el camino completo a lo largo de las conexiones ópticas (fusiones, conectores).
   */
  async traceFiber(startTerminationId: string) {
    const start = await this.prisma.opticalTermination.findUnique({ where: { id: startTerminationId } });
    if (!start) {
      return { message: 'Terminación óptica no encontrada.', startTerminationId, totalLossDb: 0, traceSequence: [] };
    }

    // The old recursive SQL included deleted links and returned a Cartesian-like set of
    // partial paths. Build a graph from active links instead: each link appears once and
    // a splitter contributes its internal input/output continuity as a virtual edge.
    const connections = await this.prisma.opticalConnection.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      include: { sourceTermination: true, targetTermination: true },
    });
    const terminations = new Map<string, { id: string; entityType: string; entityId: string; boxId: string | null }>([
      [start.id, start],
    ]);
    const adjacency = new Map<string, { id: string; to: string; connectionType: string; lossDb: number | null }[]>();
    const addEdge = (from: string, to: string, id: string, connectionType: string, lossDb: number | null) => {
      const edges = adjacency.get(from) ?? [];
      edges.push({ id, to, connectionType, lossDb });
      adjacency.set(from, edges);
    };

    for (const connection of connections) {
      terminations.set(connection.sourceTermination.id, connection.sourceTermination);
      terminations.set(connection.targetTermination.id, connection.targetTermination);
      const lossDb = connection.lossDb === null ? null : Number(connection.lossDb);
      addEdge(connection.sourceTerminationId, connection.targetTerminationId, connection.id, connection.connectionType, lossDb);
      addEdge(connection.targetTerminationId, connection.sourceTerminationId, connection.id, connection.connectionType, lossDb);
    }

    const splitterCache = new Map<string, string[]>();
    const getSplitterPeers = async (terminationId: string) => {
      const terminal = terminations.get(terminationId);
      if (!terminal || !['SPLITTER_INPUT', 'SPLITTER_OUTPUT'].includes(terminal.entityType)) return [];
      const port = await this.prisma.splitterPort.findUnique({
        where: { id: terminal.entityId },
        include: { splitter: { include: { ports: true } } },
      });
      if (!port || port.splitter.deletedAt) return [];

      let peers = splitterCache.get(port.splitterId);
      if (!peers) {
        peers = [];
        for (const sibling of port.splitter.ports) {
          let siblingTermination = await this.prisma.opticalTermination.findFirst({
            where: {
              entityType: sibling.portType === 'INPUT' ? 'SPLITTER_INPUT' : 'SPLITTER_OUTPUT',
              entityId: sibling.id,
            },
          });
          if (!siblingTermination) {
            siblingTermination = await this.prisma.opticalTermination.create({
              data: {
                type: sibling.portType === 'INPUT' ? 'SPLITTER_INPUT' : 'SPLITTER_OUTPUT',
                entityType: sibling.portType === 'INPUT' ? 'SPLITTER_INPUT' : 'SPLITTER_OUTPUT',
                entityId: sibling.id,
                boxId: port.splitter.boxId,
              },
            });
          }
          terminations.set(siblingTermination.id, siblingTermination);
          peers.push(siblingTermination.id);
        }
        splitterCache.set(port.splitterId, peers);
      }
      return peers.filter((id) => id !== terminationId);
    };

    const traceSequence: Array<{
      id: string; sourceTerminationId: string; targetTerminationId: string; connectionType: string;
      lossDb: number | null; step: number; sourceLabel: string; targetLabel: string; cumulativeLossDb: number;
    }> = [];
    const visited = new Set([startTerminationId]);
    const queue: { id: string; step: number; loss: number }[] = [{ id: startTerminationId, step: 0, loss: 0 }];
    const label = (id: string) => {
      const terminal = terminations.get(id);
      return terminal ? `${terminal.entityType} (${terminal.entityId.slice(0, 8)})` : id;
    };

    while (queue.length) {
      const current = queue.shift()!;
      const directEdges = adjacency.get(current.id) ?? [];
      const splitterPeers = await getSplitterPeers(current.id);
      const virtualEdges = splitterPeers.map((to) => ({
        id: `splitter:${current.id}:${to}`,
        to,
        connectionType: 'SPLITTER_INTERNAL',
        lossDb: null,
      }));

      for (const edge of [...directEdges, ...virtualEdges]) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        const cumulativeLossDb = current.loss + (edge.lossDb ?? 0);
        traceSequence.push({
          id: edge.id,
          sourceTerminationId: current.id,
          targetTerminationId: edge.to,
          connectionType: edge.connectionType,
          lossDb: edge.lossDb,
          step: current.step + 1,
          sourceLabel: label(current.id),
          targetLabel: label(edge.to),
          cumulativeLossDb: Math.round(cumulativeLossDb * 100) / 100,
        });
        queue.push({ id: edge.to, step: current.step + 1, loss: cumulativeLossDb });
      }
    }

    // In a branched GPON tree adding every edge loss is meaningless; show the worst
    // downstream branch loss instead, which is the useful value for a first power budget.
    const totalLossDb = Math.max(0, ...traceSequence.map((step) => step.cumulativeLossDb));

    return {
      message: traceSequence.length > 0 ? 'Traza óptica ejecutada' : 'Sin conexiones registradas para esta terminación.',
      startTerminationId,
      totalLossDb: Math.round(totalLossDb * 100) / 100,
      traceSequence,
    };
  }

  /**
   * Traza hacia aguas abajo (downstream) partiendo desde una terminación óptica de origen.
   */
  async traceFromPon(ponId: string) {
    // Primero, encontrar la terminación del puerto PON
    const ponTermination = await this.prisma.opticalTermination.findFirst({
      where: { entityType: 'PON_PORT', entityId: ponId }
    });

    if (!ponTermination) {
      return {
        message: 'Puerto PON no tiene terminación óptica registrada.',
        ponId,
        traceSequence: []
      };
    }

    // Usar el algoritmo general
    return this.traceFiber(ponTermination.id);
  }
}
