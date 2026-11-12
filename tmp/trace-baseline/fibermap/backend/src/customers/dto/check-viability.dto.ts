import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsPositive, IsString } from 'class-validator';

export class CheckViabilityDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  maxDistanceMeters?: number;
}
