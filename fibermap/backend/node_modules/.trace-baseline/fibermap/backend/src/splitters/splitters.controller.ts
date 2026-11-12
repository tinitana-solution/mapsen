import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { SplittersService } from './splitters.service.js';
import { UpdateSplitterDto } from './dto/update-splitter.dto.js';
import { CreateSplitterDto } from './dto/create-splitter.dto.js';

@Controller('splitters')
export class SplittersController {
  constructor(private readonly splittersService: SplittersService) {}

  @Post()
  create(@Body() dto: CreateSplitterDto) {
    return this.splittersService.create(dto);
  }

  @Get()
  findAll(@Query('boxId') boxId?: string) {
    return this.splittersService.findAll({ boxId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.splittersService.findOne(id);
  }

  @Get(':id/occupation')
  occupation(@Param('id') id: string) {
    return this.splittersService.calculateSplitterOccupation(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSplitterDto: UpdateSplitterDto) {
    return this.splittersService.update(id, updateSplitterDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('force') force?: string) {
    return this.splittersService.remove(id, force === 'true');
  }
}
