import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFiberConfigurationDto {
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsIn(['FREE', 'USED', 'RESERVED', 'DAMAGED', 'DISCONNECTED', 'TEST']) status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() attenuationDbPerKm?: number;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
