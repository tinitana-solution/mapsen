import { IsIn, IsOptional, IsString } from 'class-validator';
import { SPLITTER_RATIOS } from '../../domain/network-rules.js';

const SPLITTER_STATUSES = ['ACTIVE', 'INACTIVE', 'FAULTY'];

export class UpdateSplitterDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(SPLITTER_RATIOS)
  ratio?: string;

  @IsOptional()
  @IsIn(SPLITTER_STATUSES)
  status?: string;
}
