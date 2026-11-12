import { Type } from 'class-transformer';
import { IsIn, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

const omittable = () => ValidateIf((_, value) => value !== undefined);

export class CreateOdfDto {
  @IsOptional() @IsString() code?: string;
  @IsString() @IsNotEmpty() name!: string;
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(144) capacity?: number;
  @IsOptional() @IsString() description?: string;
}

export class UpdateOdfDto {
  @omittable() @IsString() @IsNotEmpty() name?: string;
  @omittable() @Type(() => Number) @IsLatitude() latitude?: number;
  @omittable() @Type(() => Number) @IsLongitude() longitude?: number;
  @omittable() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() description?: string;
}
