import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS = [
  'network.read',
  'network.write',
  'network.delete',
  'clients.read',
  'clients.write',
  'users.manage',
];

const ROLES: Record<string, string[]> = {
  ADMIN: PERMISSIONS,
  OPERATOR: ['network.read', 'network.write', 'clients.read', 'clients.write'],
  VIEWER: ['network.read', 'clients.read'],
};

async function main() {
  for (const name of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const [roleName, permissionNames] of Object.entries(ROLES)) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {
        permissions: { set: permissionNames.map((name) => ({ name })) },
      },
      create: {
        name: roleName,
        permissions: { connect: permissionNames.map((name) => ({ name })) },
      },
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@fibermap.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Administrador',
      email: adminEmail,
      passwordHash,
      roles: { connect: [{ name: 'ADMIN' }] },
    },
  });

  console.log(`Seed listo. Usuario admin: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
