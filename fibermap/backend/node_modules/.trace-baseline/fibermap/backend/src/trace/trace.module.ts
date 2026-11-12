import { Module } from '@nestjs/common';
import { ConnectionsTableModule } from '../cables/connections-table.module.js';
import { TraceService } from './trace.service.js';
import { TraceController } from './trace.controller.js';

@Module({
  imports: [ConnectionsTableModule],
  controllers: [TraceController],
  providers: [TraceService],
})
export class TraceModule {}
