-- Ejecutar DESPUÉS de `prisma db push --accept-data-loss`.

-- 1) NAP / CTO antiguos (nodos genéricos) -> cajas NAP reales, con splitter interno 1:8.
INSERT INTO boxes (id, code, name, "projectId", latitude, longitude, geometry, type, status, capacity, "updatedAt")
SELECT gen_random_uuid()::text, n.code, COALESCE(n.name, n.code), n."projectId", n.latitude, n.longitude,
       n.geometry, 'NAP', 'ACTIVE', 8, now()
FROM legacy.network_nodes n
WHERE n."nodeType" IN ('NAP', 'CTO') AND n."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM boxes b WHERE b.code = n.code AND b."projectId" = n."projectId");

INSERT INTO splitters (id, "projectId", "boxId", code, ratio, "splitterType", "inputCount", "outputCount", status, version, "updatedAt")
SELECT gen_random_uuid()::text, b."projectId", b.id, b.code || '-SPL', '1:8', 'BALANCED', 1, 8, 'ACTIVE', 1, now()
FROM boxes b
JOIN legacy.network_nodes n ON n.code = b.code AND n."projectId" = b."projectId" AND n."nodeType" IN ('NAP', 'CTO')
WHERE NOT EXISTS (SELECT 1 FROM splitters s WHERE s."boxId" = b.id);

INSERT INTO splitter_ports (id, "splitterId", "portType", number, status)
SELECT gen_random_uuid()::text, s.id, 'INPUT', 1, 'FREE'
FROM splitters s WHERE NOT EXISTS (SELECT 1 FROM splitter_ports p WHERE p."splitterId" = s.id);

INSERT INTO splitter_ports (id, "splitterId", "portType", number, status)
SELECT gen_random_uuid()::text, s.id, 'OUTPUT', g, 'FREE'
FROM splitters s, generate_series(1, s."outputCount") g
WHERE NOT EXISTS (SELECT 1 FROM splitter_ports p WHERE p."splitterId" = s.id AND p."portType" = 'OUTPUT');

-- 2) Cajas antiguas con tipos ya eliminados (CTO / SPLICE_BOX / OTHER), si existieran.
UPDATE boxes SET type = 'NAP' WHERE type IN ('CTO', 'OTHER');
UPDATE boxes SET type = 'MANGA', "mangaType" = 'EMPALME', capacity = 12 WHERE type = 'SPLICE_BOX';

-- Cuando verifiques el resultado:
-- DROP SCHEMA legacy CASCADE;
