import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateOpticalConnectionDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'REMOVED'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
