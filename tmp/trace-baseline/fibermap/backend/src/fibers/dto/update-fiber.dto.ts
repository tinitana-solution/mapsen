import { PartialType } from '@nestjs/mapped-types';
import { CreateFiberDto } from './create-fiber.dto.js';

export class UpdateFiberDto extends PartialType(CreateFiberDto) {}
