import { Module } from '@nestjs/common';
import { ConnectionsTableModule } from '../cables/connections-table.module.js';
import { OdfsService } from './odfs.service.js';
import { OdfsController } from './odfs.controller.js';

@Module({
  imports: [ConnectionsTableModule],
  controllers: [OdfsController],
  providers: [OdfsService],
})
export class OdfsModule {}
