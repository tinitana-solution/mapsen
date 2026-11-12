import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PolesController } from './poles.controller.js';
import { PolesService } from './poles.service.js';

@Module({ imports: [PrismaModule], controllers: [PolesController], providers: [PolesService], exports: [PolesService] })
export class PolesModule {}
