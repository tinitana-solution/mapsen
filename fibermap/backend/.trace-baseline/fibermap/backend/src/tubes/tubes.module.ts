import { Module } from '@nestjs/common';
import { TubesService } from './tubes.service.js';
import { TubesController } from './tubes.controller.js';

@Module({
  controllers: [TubesController],
  providers: [TubesService],
})
export class TubesModule {}
