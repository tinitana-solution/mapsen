import { PartialType } from '@nestjs/mapped-types';
import { CreateTubeDto } from './create-tube.dto.js';

export class UpdateTubeDto extends PartialType(CreateTubeDto) {}
