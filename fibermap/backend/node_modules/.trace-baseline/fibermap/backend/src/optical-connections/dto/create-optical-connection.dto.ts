import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

const TERMINATION_TYPES = ['BOX_PORT', 'SPLITTER_INPUT', 'SPLITTER_OUTPUT'];
const CONNECTION_TYPES = ['SPLICE', 'CONNECTOR', 'PATCH', 'DIRECT', 'SPLITTER_LINK', 'OTHER'];

export class CreateOpticalConnectionDto {
  @IsString()
  @IsNotEmpty()
  boxId!: string;

  @IsIn(TERMINATION_TYPES)
  sourceType!: string;

  @IsString()
  @IsNotEmpty()
  sourceId!: string;

  @IsIn(TERMINATION_TYPES)
  targetType!: string;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  // Hilo de cada lado (opcional): una fusión puede unir dos puertos sin hilo de por medio (p. ej. una
  // salida del splitter con un puerto de la caja). Si se indica, debe llegar a esta caja.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceFiberId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  targetFiberId?: string;

  @IsOptional()
  @IsIn(CONNECTION_TYPES)
  connectionType?: string;

  @IsOptional()
  @IsNumber()
  lossDb?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
