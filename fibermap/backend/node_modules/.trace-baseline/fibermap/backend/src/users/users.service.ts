import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      id: true,
      name: true,
      permissions: { select: { id: true, name: true } },
    },
  },
} as const;

export type UserPreferences = {
  showLegend: boolean;
  showImportedPoles: boolean;
  confirmDestructiveActions: boolean;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  showLegend: false,
  showImportedPoles: true,
  confirmDestructiveActions: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        roles: dto.roleNames?.length
          ? { connect: dto.roleNames.map((name) => ({ name })) }
          : undefined,
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  findAll() {
    return this.prisma.user.findMany({ select: PUBLIC_USER_SELECT });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  // Used internally by AuthService — includes the password hash for verification.
  findByEmailWithCredentials(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { permissions: true } } },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        roles: dto.roleNames
          ? { set: dto.roleNames.map((name) => ({ name })) }
          : undefined,
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: PUBLIC_USER_SELECT,
    });
  }

  touchLastLogin(id: string) {
    return this.prisma.user.update({ where: { id }, data: { lastLogin: new Date() } });
  }

  async getPreferences(id: string): Promise<UserPreferences> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { preferences: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const saved = user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
      ? user.preferences as Partial<UserPreferences>
      : {};
    return { ...DEFAULT_PREFERENCES, ...saved };
  }

  async updatePreferences(id: string, changes: Partial<UserPreferences>): Promise<UserPreferences> {
    const preferences = { ...(await this.getPreferences(id)), ...changes };
    await this.prisma.user.update({ where: { id }, data: { preferences } });
    return preferences;
  }
}
