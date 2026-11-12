import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ImportPolesDto } from './dto/import-poles.dto.js';
import { PolesService } from './poles.service.js';

@Controller('poles')
export class PolesController {
  constructor(private readonly polesService: PolesService) {}

  // GET /poles?west=&south=&east=&north=&limit=  (todos los parámetros son opcionales)
  @Get()
  findAll(
    @Query('west') west?: string,
    @Query('south') south?: string,
    @Query('east') east?: string,
    @Query('north') north?: string,
    @Query('limit') limit?: string,
  ) {
    const box = [west, south, east, north];
    const provided = box.filter((value) => value !== undefined).length;
    if (provided !== 0 && provided !== 4) {
      throw new BadRequestException('Para filtrar por zona indica west, south, east y north.');
    }
    const [w, s, e, n] = box.map(Number);
    if (provided === 4 && ![w, s, e, n].every(Number.isFinite)) {
      throw new BadRequestException('west, south, east y north deben ser números.');
    }
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    return this.polesService.findAll(
      provided === 4 ? { west: w, south: s, east: e, north: n } : undefined,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Get('count')
  count() { return this.polesService.count(); }

  @Post('import')
  importFromKmz(@Body() dto: ImportPolesDto) { return this.polesService.importFromKmz(dto); }
}
