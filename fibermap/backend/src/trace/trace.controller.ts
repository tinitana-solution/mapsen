import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { TraceService } from './trace.service.js';

@Controller('trace')
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  // Recorrido de cada hilo de un ODF (`odf`) o de una manga / caja NAP (`box`).
  @Get(':type/:id')
  trace(@Param('type') type: string, @Param('id') id: string, @Query('fiberId') fiberId?: string) {
    if (type !== 'odf' && type !== 'box') throw new BadRequestException('Tipo de dispositivo no válido');
    return this.traceService.traceDevice(type, id, fiberId);
  }
}
