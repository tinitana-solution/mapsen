import { Controller, Get, Body, Patch, Param, Put } from '@nestjs/common';
import { FibersService } from './fibers.service.js';
import { UpdateFiberConfigurationDto } from './dto/update-fiber-configuration.dto.js';
import { SetFiberTerminationsDto } from './dto/set-fiber-terminations.dto.js';

@Controller('fibers')
export class FibersController {
  constructor(private readonly fibersService: FibersService) {}

  @Get('cable/:cableId/assignment-options')
  assignmentOptions(@Param('cableId') cableId: string) {
    return this.fibersService.assignmentOptions(cableId);
  }

  @Get('box/:boxId/assignments')
  assignmentsForBox(@Param('boxId') boxId: string) {
    return this.fibersService.assignmentsForBox(boxId);
  }

  @Patch(':id/configuration')
  configure(@Param('id') id: string, @Body() dto: UpdateFiberConfigurationDto) {
    return this.fibersService.configure(id, dto);
  }

  @Put(':id/terminations')
  setTerminations(@Param('id') id: string, @Body() dto: SetFiberTerminationsDto) {
    return this.fibersService.setTerminations(id, dto);
  }
}
