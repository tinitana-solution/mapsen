import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { CABLE_FIBER_COUNTS } from '../../domain/network-rules.js';

export class CablePointDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;
}

export class CreateCableDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  // Una fibra solo puede ser de 2 (drop), 6, 12, 24 o 48 hilos.
  @Type(() => Number)
  @IsInt()
  @IsIn(CABLE_FIBER_COUNTS)
  fiberCount!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CablePointDto)
  points!: CablePointDto[];

  // Color con el que se dibuja la fibra en el mapa (#RRGGBB).
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color debe ser un color hexadecimal como #ef4444' })
  color?: string;
}
