import { Type } from 'class-transformer';
import { IsIn, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

// Campos que pueden omitirse pero nunca enviarse como null (la columna es obligatoria).
const omittable = () => ValidateIf((_, value) => value !== undefined);
import { BOX_TYPES, FIBER_COUNTS, MANGA_TYPES, SPLITTER_RATIOS } from '../../domain/network-rules.js';

export class CreateBoxDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsIn(BOX_TYPES) type!: string;

  @ValidateIf((o) => o.type === 'MANGA')
  @IsIn(MANGA_TYPES) mangaType?: string;

  // Manga: cantidad de hilos que maneja (6, 12, 24 o 48).
  @IsOptional() @Type(() => Number) @IsInt() @IsIn(FIBER_COUNTS) capacity?: number;

  // Caja NAP: relación de su splitter interno (secundario).
  @IsOptional() @IsIn(SPLITTER_RATIOS) splitterRatio?: string;

  @Type(() => Number) @IsLatitude() lat!: number;
  @Type(() => Number) @IsLongitude() lng!: number;
}

export class UpdateBoxDto {
  @omittable() @IsString() @IsNotEmpty() name?: string;
  @omittable() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsIn(MANGA_TYPES) mangaType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn(FIBER_COUNTS) capacity?: number;
  @omittable() @Type(() => Number) @IsLatitude() latitude?: number;
  @omittable() @Type(() => Number) @IsLongitude() longitude?: number;
}
