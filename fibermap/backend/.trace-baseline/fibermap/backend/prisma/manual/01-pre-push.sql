-- Ejecutar ANTES de `prisma db push --accept-data-loss` (migración a los 5 tipos de red).
-- Conserva los nodos genéricos antiguos en un esquema aparte para poder convertir los que
-- tienen equivalente (NAP/CTO -> Caja NAP). POLE, POP, CHAMBER y OLT se descartan.
CREATE SCHEMA IF NOT EXISTS legacy;
CREATE TABLE IF NOT EXISTS legacy.network_nodes AS SELECT * FROM public.network_nodes;
CREATE TABLE IF NOT EXISTS legacy.cables_types AS SELECT id, code, type FROM public.cables;
