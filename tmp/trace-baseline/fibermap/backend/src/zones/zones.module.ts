import { Module } from '@nestjs/common';
import { ZonesService } from './zones.service.js';
import { ZonesController } from './zones.controller.js';

@Module({
  controllers: [ZonesController],
  providers: [ZonesService],
})
export class ZonesModule {}
