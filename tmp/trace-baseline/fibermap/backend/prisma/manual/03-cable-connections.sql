BEGIN;
ALTER TABLE "cables" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#ef4444';
-- CreateTable
CREATE TABLE "cable_connections" (
    "id" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "elementType" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL DEFAULT 'SPLICE',
    "fiberFrom" INTEGER NOT NULL DEFAULT 1,
    "fiberTo" INTEGER NOT NULL,
    "lossDb" DECIMAL(65,30) DEFAULT 0.1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cable_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cable_connections_cableId_idx" ON "cable_connections"("cableId");

-- CreateIndex
CREATE INDEX "cable_connections_elementType_elementId_idx" ON "cable_connections"("elementType", "elementId");

-- CreateIndex
CREATE UNIQUE INDEX "cable_connections_cableId_elementType_elementId_key" ON "cable_connections"("cableId", "elementType", "elementId");

-- AddForeignKey
ALTER TABLE "cable_connections" ADD CONSTRAINT "cable_connections_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
