// Reacomoda los buffers (tubos) de las fibras ya creadas a la estructura de las hojas de empalme:
// 12 hilos = 2 buffers de 6, 24 = 4 de 6, 48 = 4 de 12. Cada hilo conserva su id, número, estado,
// etiqueta y conexiones; solo cambia de buffer, de posición dentro del buffer y de color.
// Es idempotente (volver a correrlo no cambia nada). Haz un respaldo de la base antes de ejecutarlo.
//
// Uso (dentro del contenedor del backend, con `dist/` compilado):
//   docker exec fibermap_backend node prisma/manual/06-relayout-cable-buffers.mjs
import { PrismaService } from '../../dist/prisma/prisma.service.js';
import { CablesService } from '../../dist/cables/cables.service.js';

const prisma = new PrismaService();
await prisma.$connect();
const cables = new CablesService(prisma, {});

const list = await prisma.cable.findMany({ where: { deletedAt: null }, select: { id: true, code: true, fiberCount: true } });
for (const cable of list) {
  await cables.relayoutInventory(cable.id);
  const after = await prisma.cable.findUnique({ where: { id: cable.id }, select: { tubeCount: true, fibersPerTube: true } });
  console.log(`${cable.code}: ${cable.fiberCount} hilos -> ${after.tubeCount} buffers x ${after.fibersPerTube}`);
}
await prisma.$disconnect();
