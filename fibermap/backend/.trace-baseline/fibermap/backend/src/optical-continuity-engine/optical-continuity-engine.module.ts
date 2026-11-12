import { Module, Global } from '@nestjs/common';

import { OpticalContinuityEngineService } from './optical-continuity-engine.service.js';
import { OpticalContinuityEngineController } from './optical-continuity-engine.controller.js';

@Global()
@Module({
  controllers: [OpticalContinuityEngineController],
  providers: [OpticalContinuityEngineService],
  exports: [OpticalContinuityEngineService]
})
export class OpticalContinuityEngineModule {}
