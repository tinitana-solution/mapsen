import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Ya existe un proyecto con ese código');
    return this.prisma.project.create({ data: dto });
  }

  findAll() {
    return this.prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) throw new NotFoundException('Proyecto no encontrado');
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    if (dto.code) {
      const owner = await this.prisma.project.findUnique({ where: { code: dto.code } });
      if (owner && owner.id !== id) throw new ConflictException('Ya existe un proyecto con ese código');
    }
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.project.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  }
}
