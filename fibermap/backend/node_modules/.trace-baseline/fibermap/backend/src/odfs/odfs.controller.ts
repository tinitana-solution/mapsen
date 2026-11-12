import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { OdfsService } from './odfs.service.js';
import { CreateOdfDto, UpdateOdfDto } from './dto/create-odf.dto.js';

@Controller('odfs')
export class OdfsController {
  constructor(private readonly odfsService: OdfsService) {}

  @Post() create(@Body() dto: CreateOdfDto) { return this.odfsService.create(dto); }
  @Get() findAll() { return this.odfsService.findAll(); }
  @Get(':id/table') table(@Param('id') id: string) { return this.odfsService.table(id); }
  @Get(':id') findOne(@Param('id') id: string) { return this.odfsService.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateOdfDto) { return this.odfsService.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.odfsService.remove(id); }
}
