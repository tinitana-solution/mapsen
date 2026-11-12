import { Controller, Get, Post, Body, Patch, Param, Delete, Query, BadRequestException } from '@nestjs/common';
import { OpticalConnectionsService } from './optical-connections.service.js';
import { CreateOpticalConnectionDto } from './dto/create-optical-connection.dto.js';
import { UpdateOpticalConnectionDto } from './dto/update-optical-connection.dto.js';
import { CreateFiberLinkDto } from './dto/create-fiber-link.dto.js';
import { CreateFiberSpliceDto } from './dto/create-fiber-splice.dto.js';
import { CreateFiberSplitterRouteDto } from './dto/create-fiber-splitter-route.dto.js';

@Controller('optical-connections')
export class OpticalConnectionsController {
  constructor(private readonly opticalConnectionsService: OpticalConnectionsService) {}

  @Post()
  create(@Body() createOpticalConnectionDto: CreateOpticalConnectionDto) {
    return this.opticalConnectionsService.create(createOpticalConnectionDto);
  }

  // Hilo → puerto del dispositivo, desde la tabla de conexiones (clic en el hilo y luego en el puerto).
  @Post('fiber-link')
  createFiberLink(@Body() dto: CreateFiberLinkDto) {
    return this.opticalConnectionsService.createFiberLink(dto);
  }

  // Mapeo interno entrada → salida de una manga; no ocupa ni crea un puerto de empalme.
  @Post('fiber-splice')
  createFiberSplice(@Body() dto: CreateFiberSpliceDto) {
    return this.opticalConnectionsService.createFiberSplice(dto);
  }

  // Derivación de un splitter: hilo de entrada → entrada común → salida elegida → hilo de salida.
  @Post('fiber-splitter-route')
  createFiberSplitterRoute(@Body() dto: CreateFiberSplitterRouteDto) {
    return this.opticalConnectionsService.createFiberSplitterRoute(dto);
  }

  @Get()
  findAll(@Query('boxId') boxId?: string) {
    if (!boxId) {
      throw new BadRequestException('El parámetro boxId es requerido');
    }
    return this.opticalConnectionsService.findAllForBox(boxId);
  }

  // Terminación óptica de un puerto de caja o de splitter, creándola si es la primera vez que se
  // usa (igual que al crear una fusión). Así se puede trazar desde un puerto aunque todavía no
  // tenga ninguna fusión registrada — sirve para descubrir la continuidad interna del splitter.
  @Get('termination-lookup')
  lookupTermination(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('boxId') boxId?: string,
  ) {
    if (!entityType || !entityId || !boxId) {
      throw new BadRequestException('entityType, entityId y boxId son requeridos');
    }
    return this.opticalConnectionsService.findOrCreateTerminationId(entityType, entityId, boxId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opticalConnectionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOpticalConnectionDto: UpdateOpticalConnectionDto) {
    return this.opticalConnectionsService.update(id, updateOpticalConnectionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.opticalConnectionsService.remove(id);
  }
}
