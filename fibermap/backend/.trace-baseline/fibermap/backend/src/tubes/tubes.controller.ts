import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TubesService } from './tubes.service.js';
import { CreateTubeDto } from './dto/create-tube.dto.js';
import { UpdateTubeDto } from './dto/update-tube.dto.js';

@Controller('tubes')
export class TubesController {
  constructor(private readonly tubesService: TubesService) {}

  @Post()
  create(@Body() createTubeDto: CreateTubeDto) {
    return this.tubesService.create(createTubeDto);
  }

  @Get()
  findAll() {
    return this.tubesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tubesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTubeDto: UpdateTubeDto) {
    return this.tubesService.update(+id, updateTubeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tubesService.remove(+id);
  }
}
