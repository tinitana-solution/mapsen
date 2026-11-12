-- Índice para buscar postes por zona (mapa) y por cercanía (validar NAP y trazados sobre postes).
-- Solo agrega un índice: no toca datos. Equivale a `@@index([latitude, longitude])` en schema.prisma.
CREATE INDEX IF NOT EXISTS "poles_latitude_longitude_idx" ON poles (latitude, longitude);
