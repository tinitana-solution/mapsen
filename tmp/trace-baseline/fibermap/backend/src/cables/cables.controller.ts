import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CablesService } from './cables.service.js';
import { CreateCableDto } from './dto/create-cable.dto.js';
import { UpdateCableDto } from './dto/update-cable.dto.js';
import { UpdateCableConnectionDto } from './dto/update-cable-connection.dto.js';

@Controller('cables')
export class CablesController {
  constructor(private readonly cablesService: CablesService) {}

  @Post()
  create(@Body() createCableDto: CreateCableDto) {
    return this.cablesService.create(createCableDto);
  }

  @Get()
  findAll(@Query('projectId') projectId?: string) {
    return this.cablesService.findAll({ projectId });
  }

  @Get(':id/inspection')
  inspection(@Param('id') id: string) {
    return this.cablesService.inspection(id);
  }

  @Post(':id/fibers/initialize')
  initializeFibers(@Param('id') id: string) {
    return this.cablesService.initializeFibers(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cablesService.findOne(id);
  }

  @Post(':id/reconnect')
  reconnect(@Param('id') id: string) {
    return this.cablesService.reconnect(id);
  }

  @Patch(':id/connections/:connectionId')
  updateConnection(
    @Param('id') id: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: UpdateCableConnectionDto,
  ) {
    return this.cablesService.updateConnection(id, connectionId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCableDto: UpdateCableDto) {
    return this.cablesService.update(id, updateCableDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cablesService.remove(id);
  }
}
