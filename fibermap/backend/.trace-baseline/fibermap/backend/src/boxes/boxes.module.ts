import { Module } from '@nestjs/common';
import { PolesModule } from '../poles/poles.module.js';
import { ConnectionsTableModule } from '../cables/connections-table.module.js';
import { BoxesService } from './boxes.service.js';
import { BoxesController } from './boxes.controller.js';

@Module({
  imports: [PolesModule, ConnectionsTableModule],
  controllers: [BoxesController],
  providers: [BoxesService],
})
export class BoxesModule {}
