import { Module } from '@nestjs/common';
import { FibersService } from './fibers.service.js';
import { FibersController } from './fibers.controller.js';

@Module({
  controllers: [FibersController],
  providers: [FibersService],
})
export class FibersModule {}
