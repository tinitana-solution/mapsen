import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Consider adding log: ['query'] for debugging during development
    });
  }

  private readonly logger = new Logger(PrismaService.name);

  // Si la base de datos aún no está lista (arranque conjunto de los contenedores, reinicio de
  // Postgres) se reintenta en vez de tumbar todo el servidor en el primer intento.
  async onModuleInit() {
    const maxAttempts = 15;
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        this.logger.warn(`Base de datos no disponible (intento ${attempt}/${maxAttempts}). Reintentando en 2 s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
