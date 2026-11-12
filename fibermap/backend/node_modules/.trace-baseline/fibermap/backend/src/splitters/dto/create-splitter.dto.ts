import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SPLITTER_RATIOS } from '../../domain/network-rules.js';

export class CreateSplitterDto {
  @IsString()
  @IsNotEmpty()
  boxId!: string;

  @IsIn(SPLITTER_RATIOS)
  ratio!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
