import { IsNotEmpty, IsString } from 'class-validator';
export class SetNormalMappingDto {
  @IsString() @IsNotEmpty() boxId!: string;
  @IsString() @IsNotEmpty() sourceFiberId!: string;
  @IsString() @IsNotEmpty() targetFiberId!: string;
}
