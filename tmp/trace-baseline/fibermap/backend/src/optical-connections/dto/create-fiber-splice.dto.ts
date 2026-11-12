import { IsIn, IsNotEmpty, IsString } from 'class-validator';

// Mapeo interno directo en una manga: hilo de entrada → hilo de salida, sin puerto de empalme.
export class CreateFiberSpliceDto {
  @IsIn(['MANGA'])
  deviceType!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  sourceFiberId!: string;

  @IsString()
  @IsNotEmpty()
  targetFiberId!: string;
}
