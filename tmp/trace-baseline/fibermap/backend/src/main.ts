import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';

const logger = new Logger('Process');

// Desde Node 15 un rechazo de promesa sin capturar termina el proceso. En desarrollo eso dejaba
// el contenedor "Up" pero sin servir nada (el frontend solo veía "Failed to fetch"). Se registra
// el error y el servidor sigue atendiendo peticiones.
process.on('unhandledRejection', (reason) => {
  logger.error(`Promesa rechazada sin capturar: ${reason instanceof Error ? reason.stack : String(reason)}`);
});
process.on('uncaughtException', (error) => {
  logger.error(`Excepción sin capturar: ${error.stack ?? error.message}`);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Las cargas de postes envían lotes de miles de puntos: el límite por defecto (100 kb) los rechazaría.
  app.useBodyParser('json', { limit: '10mb' });
  app.enableCors();
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
// Un fallo al arrancar (puerto ocupado, módulo que no carga) debe terminar el proceso: si lo
// tragara el manejador global el contenedor quedaría "Up" sin servir nada.
bootstrap().catch((error: unknown) => {
  logger.error(`No se pudo iniciar el servidor: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
