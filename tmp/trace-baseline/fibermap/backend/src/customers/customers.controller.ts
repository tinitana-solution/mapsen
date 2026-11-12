import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { CheckViabilityDto } from './dto/check-viability.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Any authenticated user can check viability for a candidate address before it becomes a customer record.
  @Get('viability')
  checkViability(@Query() dto: CheckViabilityDto) {
    return this.customersService.checkViability(dto);
  }

  @Get()
  findAll(@Query() query: { projectId?: string; status?: string; search?: string }) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
