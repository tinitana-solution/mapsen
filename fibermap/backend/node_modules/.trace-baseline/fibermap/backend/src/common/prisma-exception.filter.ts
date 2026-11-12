import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type PrismaError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientValidationError
  | Prisma.PrismaClientInitializationError;

// Sin este filtro cualquier error de la base de datos (duplicado, registro inexistente,
// referencia bloqueada, base caída) llegaba al cliente como un "500 Internal Server Error"
// opaco. Aquí se traduce al código HTTP correcto con un mensaje que se puede mostrar tal cual.
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(exception: PrismaError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const { status, message } = this.translate(exception);
    if (status >= 500) this.logger.error(exception.message);
    response.status(status).json({ statusCode: status, error: HttpStatus[status], message });
  }

  private translate(exception: PrismaError): { status: number; message: string } {
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'No hay conexión con la base de datos. Inténtalo de nuevo en unos segundos.' };
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      // El mensaje de Prisma incluye el nombre del campo ("Argument `latitude` ..."); se muestra solo
      // ese nombre para que el usuario sepa qué corregir, sin filtrar la consulta interna.
      const field = /Argument `(\w+)`/.exec(exception.message)?.[1];
      this.logger.warn(`Datos inválidos${field ? ` en «${field}»` : ''}: ${exception.message.split('\n').slice(-3).join(' ').trim()}`);
      return {
        status: HttpStatus.BAD_REQUEST,
        message: field ? `Los datos enviados no son válidos: revisa el campo «${field}».` : 'Los datos enviados no son válidos.',
      };
    }
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | string | undefined) ?? [];
        const fields = Array.isArray(target) ? target.filter((f) => f !== 'projectId').join(', ') : String(target);
        return { status: HttpStatus.CONFLICT, message: `Ya existe un registro con ese valor${fields ? ` (${fields})` : ''}.` };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'El registro solicitado no existe o ya fue eliminado.' };
      case 'P2003':
      case 'P2014':
        return { status: HttpStatus.CONFLICT, message: 'No se puede completar la operación porque el registro está relacionado con otros datos.' };
      case 'P2000':
        return { status: HttpStatus.BAD_REQUEST, message: 'Uno de los valores enviados es demasiado largo.' };
      case 'P1001':
      case 'P1002':
      case 'P1008':
      case 'P1017':
        return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'No hay conexión con la base de datos. Inténtalo de nuevo en unos segundos.' };
      default:
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Ocurrió un error inesperado en el servidor.' };
    }
  }
}
