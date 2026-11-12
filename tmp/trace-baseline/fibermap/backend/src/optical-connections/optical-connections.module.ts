import { Module } from '@nestjs/common';
import { OpticalConnectionsService } from './optical-connections.service.js';
import { OpticalConnectionsController } from './optical-connections.controller.js';
import { ConnectionsTableModule } from '../cables/connections-table.module.js';

@Module({
  imports: [ConnectionsTableModule],
  controllers: [OpticalConnectionsController],
  providers: [OpticalConnectionsService],
  exports: [OpticalConnectionsService],
})
export class OpticalConnectionsModule {}
