// Crea el splitter que les falta a las cajas ya existentes: 1:8 (o 1:16 según su capacidad) en cada
// caja NAP y 1:8 primario en cada manga de distribución. Solo agrega splitters a las que no tienen
// ninguno (idempotente); no toca los existentes. Haz un respaldo antes de ejecutarlo.
//
//   docker exec fibermap_backend node prisma/manual/07-backfill-splitters.mjs
import { PrismaService } from '../../dist/prisma/prisma.service.js';
import { BoxesService } from '../../dist/boxes/boxes.service.js';

const prisma = new PrismaService();
await prisma.$connect();
const boxes = new BoxesService(prisma, {}, {});
const all = await prisma.box.findMany({ where: { deletedAt: null } });
for (const box of all) {
  const created = await boxes.ensureSplitter(box);
  if (created) console.log(`splitter creado en ${box.type} ${box.code}`);
}
await prisma.$disconnect();
