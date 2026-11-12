import { OpticalConnectionsModule } from '../optical-connections/optical-connections.module.js';
import { Module } from '@nestjs/common';
import { PolesModule } from '../poles/poles.module.js';
import { CablesService } from './cables.service.js';
import { CablesController } from './cables.controller.js';

@Module({
  imports: [PolesModule, OpticalConnectionsModule],
  controllers: [CablesController],
  providers: [CablesService],
})
export class CablesModule {}
