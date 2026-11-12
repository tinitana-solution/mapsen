import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter.js';

function run(exception: Error) {
  const json = vi.fn<(body: { message: string }) => void>();
  const status = vi.fn<(code: number) => { json: typeof json }>(() => ({ json }));
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as never;
  new PrismaExceptionFilter().catch(exception as never, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test', meta });

describe('PrismaExceptionFilter', () => {
  it('registro duplicado -> 409 y nombra el campo (sin projectId)', () => {
    const { status, body } = run(known('P2002', { target: ['code', 'projectId'] }));
    expect(status).toBe(409);
    expect(body.message).toContain('code');
    expect(body.message).not.toContain('projectId');
  });

  it('datos inválidos nombra el campo', () => {
    const error = new Prisma.PrismaClientValidationError('Invalid `prisma.box.update()`\nArgument `latitude`: value is null', { clientVersion: 'test' });
    const { status, body } = run(error);
    expect(status).toBe(400);
    expect(body.message).toContain('latitude');
  });

  it('registro inexistente -> 404', () => {
    expect(run(known('P2025')).status).toBe(404);
  });

  it('registro relacionado con otros datos -> 409', () => {
    expect(run(known('P2003')).status).toBe(409);
  });

  it('base de datos inaccesible -> 503', () => {
    expect(run(known('P1001')).status).toBe(503);
    expect(run(new Prisma.PrismaClientInitializationError('no db', 'test')).status).toBe(503);
  });

  it('código desconocido -> 500 con mensaje genérico (no filtra detalles internos)', () => {
    const { status, body } = run(known('P9999'));
    expect(status).toBe(500);
    expect(body.message).not.toContain('boom');
  });
});
