import { Type } from 'class-transformer';
import { IsIn, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['PLANNED', 'ACTIVE', 'ARCHIVED'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  centerLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  centerLongitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(22)
  defaultZoom?: number;
}
