import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

// ODF_PORT se agregó para que un hilo también pueda terminar en un ODF: una fibra puede
// empezar en un ODF, una manga o una caja NAP (ver network-rules), no solo en manga/NAP.
const TERMINATION_TYPES = ['BOX_PORT', 'SPLITTER_INPUT', 'SPLITTER_OUTPUT', 'ODF_PORT'];

export class FiberTerminalDto {
  @IsIn(TERMINATION_TYPES) type!: string;
  @IsString() @IsNotEmpty() entityId!: string;
  // Id del dispositivo dueño del puerto: una caja (manga/NAP) o, si type es ODF_PORT, un ODF.
  @IsString() @IsNotEmpty() boxId!: string;
  @IsString() @IsNotEmpty() portIdentifier!: string;
}

export class SetFiberTerminationsDto {
  @ValidateNested() @Type(() => FiberTerminalDto) source!: FiberTerminalDto;
  @ValidateNested() @Type(() => FiberTerminalDto) target!: FiberTerminalDto;
}
