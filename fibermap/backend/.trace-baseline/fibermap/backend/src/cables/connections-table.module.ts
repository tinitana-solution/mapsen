import { Module } from '@nestjs/common';
import { ConnectionsTableService } from './connections-table.service.js';

@Module({
  providers: [ConnectionsTableService],
  exports: [ConnectionsTableService],
})
export class ConnectionsTableModule {}
