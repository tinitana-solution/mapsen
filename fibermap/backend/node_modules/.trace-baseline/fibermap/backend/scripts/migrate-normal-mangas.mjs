import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
export async function migrateNormalMangas(prisma) {
  const boxes = await prisma.box.findMany({ where: { type: 'MANGA', deletedAt: null, mangaType: { in: ['PASO', 'EMPALME', 'DISTRIBUCION_NORMAL'] } } });
  let migrated = 0;
  for (const box of boxes) {
    migrated += await prisma.$transaction(async (tx) => {
      const links = await tx.opticalConnection.findMany({
        where: { deletedAt: null, OR: [{ sourceTermination: { boxId: box.id } }, { targetTermination: { boxId: box.id } }] },
        include: { sourceTermination: true, targetTermination: true, sourceFiber: true, targetFiber: true },
      });
      const groups = new Map();
      for (const link of links) {
        const a = link.sourceTermination;
        const b = link.targetTermination;
        if (['FIBER', 'FIBER_IN'].includes(a.entityType) && ['FIBER', 'FIBER_OUT'].includes(b.entityType)) continue;
        if (a.entityType === 'FIBER' && b.entityType === 'BOX_PORT' && link.sourceFiber) {
          const group = groups.get(b.entityId) ?? [];
          group.push(link);
          groups.set(b.entityId, group);
        } else {
          throw new Error(`${box.code}: hay conexiones de puertos o splitters que requieren revisar sus hilos antes de convertirlas. No se modificó esta manga.`);
        }
      }
      let count = 0;
      for (const group of groups.values()) {
        const unique = [...new Map(group.map((link) => [link.sourceFiber.id, link])).values()];
        if (unique.length > 2) throw new Error(`${box.code}: un puerto tiene más de dos hilos; se conserva para revisión.`);
        await tx.opticalConnection.updateMany({ where: { id: { in: group.map((l) => l.id) } }, data: { deletedAt: new Date() } });
        if (unique.length === 2) {
          const [a, b] = unique;
          if (a.sourceFiber.cableId === b.sourceFiber.cableId) throw new Error(`${box.code}: el puerto une hilos del mismo cable; no se modificó esta manga.`);
          const busy = await tx.opticalConnection.findFirst({ where: { deletedAt: null, OR: [
            { sourceTerminationId: { in: [a.sourceTerminationId, b.sourceTerminationId] } },
            { targetTerminationId: { in: [a.sourceTerminationId, b.sourceTerminationId] } },
          ] } });
          if (busy) throw new Error(`${box.code}: un hilo tiene otra conexión activa; no se modificó esta manga.`);
          const stop = await tx.cableConnection.findFirst({ where: { elementId: box.id, elementType: 'MANGA', cableId: a.sourceFiber.cableId } });
          const [input, output] = stop?.role === 'START' ? [b, a] : [a, b];
          await tx.opticalConnection.create({ data: {
            sourceTerminationId: input.sourceTerminationId, targetTerminationId: output.sourceTerminationId,
            sourceFiberId: input.sourceFiber.id, targetFiberId: output.sourceFiber.id,
            connectionType: 'SPLICE', notes: 'Empalme conservado al convertir la manga al funcionamiento normal.',
          } });
          count++;
        }
      }
      await tx.boxPort.updateMany({ where: { boxId: box.id, deletedAt: null }, data: { deletedAt: new Date(), status: 'FREE' } });
      await tx.splitter.updateMany({ where: { boxId: box.id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.box.update({ where: { id: box.id }, data: { portCapacity: 0, usedPorts: 0 } });
      return count;
    }, { timeout: 30000 });
  }
  return { boxes: boxes.length, splices: migrated };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const prisma = new PrismaClient();
  try {
    const result = await migrateNormalMangas(prisma);
    console.log(`Conversión completada: ${result.boxes} mangas normales; ${result.splices} empalmes conservados.`);
  } finally {
    await prisma.$disconnect();
  }
}
