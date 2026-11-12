import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ImportedPoleDto {
  @IsString() @IsNotEmpty() @MaxLength(120) code!: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
  @IsOptional() @IsString() @MaxLength(60) material?: string;
  @IsOptional() @IsString() @MaxLength(120) owner?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  // Compatibilidad con cargas anteriores: se guarda como notas.
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class ImportPolesDto {
  @IsArray() @ArrayMaxSize(5000)
  @ValidateNested({ each: true }) @Type(() => ImportedPoleDto)
  poles!: ImportedPoleDto[];
}
