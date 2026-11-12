import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CreateCableDto } from './create-cable.dto.js';

export class UpdateCableDto extends PartialType(CreateCableDto) {
  @IsOptional()
  @IsIn(['PLANNED', 'ACTIVE', 'INACTIVE', 'DAMAGED'])
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
