-- Parche no destructivo para bases creadas antes del modelo ODF/Manga actual.
-- Se puede ejecutar más de una vez: solo añade objetos requeridos por Prisma y conserva
-- las tablas/columnas heredadas (por ejemplo network_nodes y cables.type).

ALTER TABLE "boxes" ADD COLUMN IF NOT EXISTS "mangaType" TEXT;
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "odfPortId" TEXT;
ALTER TABLE "optical_terminations" ADD COLUMN IF NOT EXISTS "odfId" TEXT;
-- Fibras asignadas a cada extremo de una fusión/conector. Son opcionales para
-- conservar las conexiones históricas, pero toda conexión nueva las exige.
ALTER TABLE "optical_connections" ADD COLUMN IF NOT EXISTS "sourceFiberId" TEXT;
ALTER TABLE "optical_connections" ADD COLUMN IF NOT EXISTS "targetFiberId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" JSONB;
ALTER TABLE "cables" ALTER COLUMN "type" SET DEFAULT 'DISTRIBUTION';

CREATE TABLE IF NOT EXISTS "odfs" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "latitude" DECIMAL(65,30) NOT NULL,
  "longitude" DECIMAL(65,30) NOT NULL,
  "geometry" geometry(Point, 4326),
  "capacity" INTEGER NOT NULL DEFAULT 24,
  "usedPorts" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "odfs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "odf_ports" (
  "id" TEXT NOT NULL,
  "odfId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "label" TEXT,
  "status" TEXT NOT NULL DEFAULT 'FREE',
  "connectorType" TEXT,
  "notes" TEXT,
  CONSTRAINT "odf_ports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "odfs_code_projectId_key" ON "odfs"("code", "projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "odf_ports_odfId_number_key" ON "odf_ports"("odfId", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "olts_odfPortId_key" ON "olts"("odfPortId");
CREATE INDEX IF NOT EXISTS "poles_projectId_idx" ON "poles"("projectId");
CREATE INDEX IF NOT EXISTS "optical_connections_sourceFiberId_idx" ON "optical_connections"("sourceFiberId");
CREATE INDEX IF NOT EXISTS "optical_connections_targetFiberId_idx" ON "optical_connections"("targetFiberId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odfs_projectId_fkey') THEN
    ALTER TABLE "odfs" ADD CONSTRAINT "odfs_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odf_ports_odfId_fkey') THEN
    ALTER TABLE "odf_ports" ADD CONSTRAINT "odf_ports_odfId_fkey"
      FOREIGN KEY ("odfId") REFERENCES "odfs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'olts_odfPortId_fkey') THEN
    ALTER TABLE "olts" ADD CONSTRAINT "olts_odfPortId_fkey"
      FOREIGN KEY ("odfPortId") REFERENCES "odf_ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'optical_terminations_odfId_fkey') THEN
    ALTER TABLE "optical_terminations" ADD CONSTRAINT "optical_terminations_odfId_fkey"
      FOREIGN KEY ("odfId") REFERENCES "odfs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'optical_connections_sourceFiberId_fkey') THEN
    ALTER TABLE "optical_connections" ADD CONSTRAINT "optical_connections_sourceFiberId_fkey"
      FOREIGN KEY ("sourceFiberId") REFERENCES "fibers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'optical_connections_targetFiberId_fkey') THEN
    ALTER TABLE "optical_connections" ADD CONSTRAINT "optical_connections_targetFiberId_fkey"
      FOREIGN KEY ("targetFiberId") REFERENCES "fibers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
