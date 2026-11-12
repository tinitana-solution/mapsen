import { Injectable } from '@nestjs/common';
import { CreateTubeDto } from './dto/create-tube.dto.js';
import { UpdateTubeDto } from './dto/update-tube.dto.js';

@Injectable()
export class TubesService {
  create(createTubeDto: CreateTubeDto) {
    return 'This action adds a new tube';
  }

  findAll() {
    return `This action returns all tubes`;
  }

  findOne(id: number) {
    return `This action returns a #${id} tube`;
  }

  update(id: number, updateTubeDto: UpdateTubeDto) {
    return `This action updates a #${id} tube`;
  }

  remove(id: number) {
    return `This action removes a #${id} tube`;
  }
}
