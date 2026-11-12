import { Module } from '@nestjs/common';
import { GisService } from './gis.service.js';
import { GisController } from './gis.controller.js';

@Module({
  providers: [GisService],
  controllers: [GisController]
})
export class GisModule {}
