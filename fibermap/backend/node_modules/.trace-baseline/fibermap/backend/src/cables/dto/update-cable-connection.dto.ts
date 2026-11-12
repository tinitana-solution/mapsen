import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CABLE_CONNECTION_TYPES } from '../../domain/network-rules.js';

export class UpdateCableConnectionDto {
  @IsOptional()
  @IsIn(CABLE_CONNECTION_TYPES)
  connectionType?: string;

  // Rango de hilos de la fibra que se conectan al dispositivo.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fiberFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fiberTo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30)
  lossDb?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
