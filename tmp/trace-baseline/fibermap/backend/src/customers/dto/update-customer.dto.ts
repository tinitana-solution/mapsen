import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto.js';

const CUSTOMER_STATUSES = ['PROSPECT', 'VIABLE', 'NOT_VIABLE', 'CONNECTED', 'INACTIVE'];

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: string;
}
