import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { GisModule } from './gis/gis.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { RegionsModule } from './regions/regions.module.js';
import { ZonesModule } from './zones/zones.module.js';
import { BoxesModule } from './boxes/boxes.module.js';
import { OdfsModule } from './odfs/odfs.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { InfrastructureValidatorService } from './infrastructure-validator/infrastructure-validator.service.js';
import { BoxCapacityService } from './box-capacity/box-capacity.service.js';
import { CablesModule } from './cables/cables.module.js';
import { TubesModule } from './tubes/tubes.module.js';
import { FibersModule } from './fibers/fibers.module.js';
import { SplittersModule } from './splitters/splitters.module.js';
import { OpticalConnectionsModule } from './optical-connections/optical-connections.module.js';
import { OpticalContinuityEngineService } from './optical-continuity-engine/optical-continuity-engine.service.js';
import { OpticalTopologyValidatorService } from './optical-topology-validator/optical-topology-validator.service.js';
import { CableCapacityService } from './cable-capacity/cable-capacity.service.js';
import { FiberColorService } from './fiber-color/fiber-color.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OpticalContinuityEngineModule } from './optical-continuity-engine/optical-continuity-engine.module.js';
import { OpticalTopologyValidatorModule } from './optical-topology-validator/optical-topology-validator.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { HealthController } from './health/health.controller.js';
import { PolesModule } from './poles/poles.module.js';
import { TraceModule } from './trace/trace.module.js';

@Module({
  imports: [GisModule, ProjectsModule, RegionsModule, ZonesModule, BoxesModule, OdfsModule, InventoryModule, CablesModule, TubesModule, FibersModule, SplittersModule, OpticalConnectionsModule, PrismaModule, OpticalContinuityEngineModule, OpticalTopologyValidatorModule, AuthModule, UsersModule, CustomersModule, PolesModule, TraceModule],
  controllers: [AppController, HealthController],
  providers: [AppService, InfrastructureValidatorService, BoxCapacityService, OpticalContinuityEngineService, OpticalTopologyValidatorService, CableCapacityService, FiberColorService],
})
export class AppModule {}
