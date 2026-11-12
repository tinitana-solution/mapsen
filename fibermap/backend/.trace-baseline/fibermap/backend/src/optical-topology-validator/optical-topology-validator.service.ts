import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OpticalTopologyValidatorService {
  constructor(private prisma: PrismaService) {}

  /**
   * Valida si la conexión propuesta crea un ciclo óptico.
   * Utiliza la base de datos para buscar si targetTerminationId ya puede alcanzar a sourceTerminationId.
   */
  async validateNoCycles(sourceTerminationId: string, targetTerminationId: string): Promise<boolean> {
    if (sourceTerminationId === targetTerminationId) {
      throw new BadRequestException('Optical cycle detected: source and target are the same termination');
    }
    
    // Check if there is an existing path from target to source
    const result = await this.prisma.$queryRaw`
      WITH RECURSIVE trace AS (
        SELECT id, "sourceTerminationId", "targetTerminationId", ARRAY[id::text] as path_ids
        FROM optical_connections
        WHERE "deletedAt" IS NULL AND ("sourceTerminationId" = ${targetTerminationId} OR "targetTerminationId" = ${targetTerminationId})

        UNION ALL

        SELECT c.id, c."sourceTerminationId", c."targetTerminationId", t.path_ids || c.id::text
        FROM optical_connections c
        INNER JOIN trace t ON 
          (c."sourceTerminationId" = t."targetTerminationId" OR 
           c."targetTerminationId" = t."sourceTerminationId" OR
           c."sourceTerminationId" = t."sourceTerminationId" OR
           c."targetTerminationId" = t."targetTerminationId")
        WHERE c."deletedAt" IS NULL AND NOT (c.id::text = ANY(t.path_ids))
      )
      SELECT 1 FROM trace 
      WHERE "sourceTerminationId" = ${sourceTerminationId} OR "targetTerminationId" = ${sourceTerminationId}
      LIMIT 1;
    `;

    if (Array.isArray(result) && result.length > 0) {
      throw new BadRequestException('Optical cycle detected: connecting these points creates a loop in the optical network.');
    }

    return true;
  }

  /**
   * Valida que una terminación no esté siendo usada doblemente de manera incompatible.
   */
  async validateTerminationAvailability(terminationId: string): Promise<boolean> {
    const term = await this.prisma.opticalTermination.findUnique({
      where: { id: terminationId },
      include: {
        sourceConnections: { where: { status: 'ACTIVE', deletedAt: null } },
        targetConnections: { where: { status: 'ACTIVE', deletedAt: null } }
      }
    });

    if (!term) {
      throw new BadRequestException('Termination not found.');
    }

    const activeConnectionsCount = term.sourceConnections.length + term.targetConnections.length;

    // By default, most single optical terminations (like a single fiber end or single port) can only have 1 active connection.
    if (activeConnectionsCount >= 1) {
       throw new BadRequestException(`Termination ${terminationId} is already connected.`);
    }

    return true;
  }
}
