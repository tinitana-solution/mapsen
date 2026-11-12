import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './strategies/jwt.strategy.js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmailWithCredentials(email);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.usersService.touchLastLogin(user.id);

    const payload = this.buildPayload(user);
    return {
      ...this.signTokens(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: payload.roles,
        permissions: payload.permissions,
      },
    };
  }

  async register(name: string, email: string, password: string) {
    // Self-service signups start as VIEWER; an admin promotes them to OPERATOR/ADMIN afterwards.
    const created = await this.usersService.create({ name, email, password, roleNames: ['VIEWER'] });
    const user = await this.usersService.findByEmailWithCredentials(created.email);
    if (!user) {
      throw new UnauthorizedException('No se pudo completar el registro');
    }

    const payload = this.buildPayload(user);
    return {
      ...this.signTokens(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: payload.roles,
        permissions: payload.permissions,
      },
    };
  }

  async refresh(refreshToken: string) {
    let decoded: JwtPayload;
    try {
      decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.usersService.findByEmailWithCredentials(decoded.email);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    return this.signTokens(this.buildPayload(user));
  }

  getPreferences(userId: string) {
    return this.usersService.getPreferences(userId);
  }

  updatePreferences(userId: string, preferences: Parameters<UsersService['updatePreferences']>[1]) {
    return this.usersService.updatePreferences(userId, preferences);
  }

  private buildPayload(user: {
    id: string;
    email: string;
    roles: { name: string; permissions: { name: string }[] }[];
  }): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.name),
      permissions: [...new Set(user.roles.flatMap((r) => r.permissions.map((p) => p.name)))],
    };
  }

  private signTokens(payload: JwtPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: (process.env.JWT_EXPIRES_IN ?? '1h') as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
    return { accessToken, refreshToken };
  }
}
