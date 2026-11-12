import { IsIn, IsNotEmpty, IsString } from 'class-validator';

// Une un hilo de una fibra con un puerto del dispositivo al que llega (desde la tabla de conexiones).
// `terminalKey` es `TIPO:id` tal como lo devuelve la tabla: BOX_PORT:<id>, SPLITTER_INPUT:<id>,
// SPLITTER_OUTPUT:<id> u ODF_PORT:<número>.
export class CreateFiberLinkDto {
  @IsIn(['ODF', 'MANGA', 'NAP'])
  deviceType!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  fiberId!: string;

  @IsString()
  @IsNotEmpty()
  terminalKey!: string;
}
