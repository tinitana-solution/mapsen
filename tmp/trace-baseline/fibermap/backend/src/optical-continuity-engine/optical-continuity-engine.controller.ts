import { Controller, Get, Param } from '@nestjs/common';
import { OpticalContinuityEngineService } from './optical-continuity-engine.service.js';

@Controller('optical-trace')
export class OpticalContinuityEngineController {
  constructor(private readonly engine: OpticalContinuityEngineService) {}

  @Get('termination/:id')
  traceFromTermination(@Param('id') id: string) {
    return this.engine.traceFiber(id);
  }

  @Get('pon/:ponId')
  traceFromPon(@Param('ponId') ponId: string) {
    return this.engine.traceFromPon(ponId);
  }
}
