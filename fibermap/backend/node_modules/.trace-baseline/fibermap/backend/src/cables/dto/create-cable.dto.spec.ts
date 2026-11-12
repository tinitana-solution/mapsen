import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCableDto } from './create-cable.dto.js';

const points = [{ lat: -2.9, lng: -79.0 }, { lat: -2.91, lng: -79.0 }];
const check = (fiberCount: number, color?: string) =>
  validate(plainToInstance(CreateCableDto, { fiberCount, points, color }));

describe('CreateCableDto', () => {
  it.each([2, 6, 12, 24, 48])('acepta una fibra de %i hilos', async (count) => {
    expect(await check(count)).toHaveLength(0);
  });

  it.each([1, 3, 8, 96])('rechaza una fibra de %i hilos', async (count) => {
    const errors = await check(count);
    expect(errors.map((e) => e.property)).toContain('fiberCount');
  });

  it('valida el formato del color', async () => {
    expect(await check(12, '#8b4513')).toHaveLength(0);
    expect((await check(12, 'marrón')).map((e) => e.property)).toContain('color');
  });
});
