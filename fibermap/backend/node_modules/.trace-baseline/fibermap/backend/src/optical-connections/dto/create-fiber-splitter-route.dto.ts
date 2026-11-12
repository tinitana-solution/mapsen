import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Derivación dentro de una manga: un hilo alimenta la entrada común del splitter y una de sus
// salidas continúa hacia otro hilo. Los cuatro extremos se guardan de forma atómica.
export class CreateFiberSplitterRouteDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  // Solo se envía al alimentar por primera vez el splitter. Las demás salidas reutilizan la
  // entrada que ya está conectada y no crean otra conexión de entrada.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceFiberId?: string;

  @IsString()
  @IsNotEmpty()
  targetFiberId!: string;

  @IsString()
  @IsNotEmpty()
  splitterInputPortId!: string;

  @IsString()
  @IsNotEmpty()
  splitterOutputPortId!: string;
}
