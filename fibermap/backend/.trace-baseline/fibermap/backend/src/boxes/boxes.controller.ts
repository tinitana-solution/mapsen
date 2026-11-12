import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BoxesService } from './boxes.service.js';
import { CreateBoxDto, UpdateBoxDto } from './dto/create-box.dto.js';

@Controller('boxes')
export class BoxesController {
  constructor(private readonly boxesService: BoxesService) {}

  @Post()
  create(@Body() createBoxDto: CreateBoxDto) {
    return this.boxesService.create(createBoxDto);
  }

  @Get()
  findAll() {
    return this.boxesService.findAll();
  }

  @Get(':id/table')
  table(@Param('id') id: string) {
    return this.boxesService.table(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.boxesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBoxDto: UpdateBoxDto) {
    return this.boxesService.update(id, updateBoxDto);
  }

  @Post(':id/ports')
  generatePorts(@Param('id') id: string, @Body() body: { count: number; type?: string }) {
    return this.boxesService.generatePorts(id, body.count, body.type);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.boxesService.remove(id);
  }
}
