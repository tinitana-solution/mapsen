import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CableCapacityService {
  constructor(private prisma: PrismaService) {}

  async calculateCableOccupation(cableId: string) {
    const cable = await this.prisma.cable.findUnique({
      where: { id: cableId },
      include: {
        tubes: {
          include: {
            fibers: true
          }
        }
      }
    });

    if (!cable) {
      throw new NotFoundException(`Cable con ID ${cableId} no encontrado`);
    }

    let totalCapacity = cable.fiberCount;
    let usedCapacity = 0;

    for (const tube of cable.tubes) {
      for (const fiber of tube.fibers) {
        if (fiber.status === 'USED' || fiber.status === 'RESERVED') {
          usedCapacity += 1;
        }
      }
    }

    let occupationPercentage = 0;
    if (totalCapacity > 0) {
       occupationPercentage = (usedCapacity / totalCapacity) * 100;
       occupationPercentage = Math.round(occupationPercentage * 100) / 100;
    }

    return {
      cableId,
      totalCapacity,
      usedCapacity,
      occupationPercentage
    };
  }
}
