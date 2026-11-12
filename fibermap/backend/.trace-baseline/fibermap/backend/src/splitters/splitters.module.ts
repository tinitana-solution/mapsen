import { Module } from '@nestjs/common';
import { SplittersService } from './splitters.service.js';
import { SplittersController } from './splitters.controller.js';
import { OpticalConnectionsModule } from '../optical-connections/optical-connections.module.js';

@Module({
  imports: [OpticalConnectionsModule],
  controllers: [SplittersController],
  providers: [SplittersService],
})
export class SplittersModule {}
