import { Module, Global } from '@nestjs/common';

import { OpticalTopologyValidatorService } from './optical-topology-validator.service.js';

@Global()
@Module({
  providers: [OpticalTopologyValidatorService],
  exports: [OpticalTopologyValidatorService]
})
export class OpticalTopologyValidatorModule {}
