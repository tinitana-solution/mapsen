import { PrismaService } from '../prisma/prisma.service.js';
import { OpticalTopologyValidatorService } from '../optical-topology-validator/optical-topology-validator.service.js';
import { CreateOpticalConnectionDto } from './dto/create-optical-connection.dto.js';
import { UpdateOpticalConnectionDto } from './dto/update-optical-connection.dto.js';
import { CreateFiberLinkDto } from './dto/create-fiber-link.dto.js';
import { CreateFiberSpliceDto } from './dto/create-fiber-splice.dto.js';
import { CreateFiberSplitterRouteDto } from './dto/create-fiber-splitter-route.dto.js';
import { ConnectionsTableService } from '../cables/connections-table.service.js';
export declare const FIBER_ENTITY = "FIBER";
export declare class OpticalConnectionsService {
    private prisma;
    private topologyValidator;
    private connectionsTable;
    constructor(prisma: PrismaService, topologyValidator: OpticalTopologyValidatorService, connectionsTable: ConnectionsTableService);
    private resolveTermination;
    private setPortStatus;
    createFiberLink(dto: CreateFiberLinkDto): Promise<{
        sourceTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        targetTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        sourceFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
        targetFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    }>;
    private syncBoxOccupancyForTypes;
    private assertFiberAtBox;
    create(dto: CreateOpticalConnectionDto): Promise<{
        sourceTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        targetTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        sourceFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
        targetFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    }>;
    createFiberSplice(dto: CreateFiberSpliceDto): Promise<{
        sourceTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        targetTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        sourceFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
        targetFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    }>;
    createFiberSplitterRoute(dto: CreateFiberSplitterRouteDto): Promise<{
        inputConnection: ({
            sourceTermination: {
                id: string;
                createdAt: Date;
                type: string;
                entityType: string;
                entityId: string;
                portIdentifier: string | null;
                boxId: string | null;
                odfId: string | null;
                metadata: import("@prisma/client/runtime/library").JsonValue | null;
            };
            targetTermination: {
                id: string;
                createdAt: Date;
                type: string;
                entityType: string;
                entityId: string;
                portIdentifier: string | null;
                boxId: string | null;
                odfId: string | null;
                metadata: import("@prisma/client/runtime/library").JsonValue | null;
            };
            sourceFiber: {
                number: number;
                id: string;
                color: string;
                label: string | null;
            } | null;
            targetFiber: {
                number: number;
                id: string;
                color: string;
                label: string | null;
            } | null;
        } & {
            status: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            notes: string | null;
            connectionType: string;
            lossDb: import("@prisma/client/runtime/library").Decimal | null;
            version: number;
            sourceTerminationId: string;
            targetTerminationId: string;
            sourceFiberId: string | null;
            targetFiberId: string | null;
            spliceMethod: string | null;
            technician: string | null;
            splicedAt: Date | null;
        }) | null;
        outputConnection: {
            sourceTermination: {
                id: string;
                createdAt: Date;
                type: string;
                entityType: string;
                entityId: string;
                portIdentifier: string | null;
                boxId: string | null;
                odfId: string | null;
                metadata: import("@prisma/client/runtime/library").JsonValue | null;
            };
            targetTermination: {
                id: string;
                createdAt: Date;
                type: string;
                entityType: string;
                entityId: string;
                portIdentifier: string | null;
                boxId: string | null;
                odfId: string | null;
                metadata: import("@prisma/client/runtime/library").JsonValue | null;
            };
            sourceFiber: {
                number: number;
                id: string;
                color: string;
                label: string | null;
            } | null;
            targetFiber: {
                number: number;
                id: string;
                color: string;
                label: string | null;
            } | null;
        } & {
            status: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            notes: string | null;
            connectionType: string;
            lossDb: import("@prisma/client/runtime/library").Decimal | null;
            version: number;
            sourceTerminationId: string;
            targetTerminationId: string;
            sourceFiberId: string | null;
            targetFiberId: string | null;
            spliceMethod: string | null;
            technician: string | null;
            splicedAt: Date | null;
        };
    }>;
    setNormalMapping(dto: unknown): Promise<{
        sourceTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        targetTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        sourceFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
        targetFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    }>;
    assignCablePorts(cableId: string): Promise<{
        cableId: string;
        assignedPorts: number;
        mode: string;
    }>;
    findOrCreateTerminationId(entityType: string, entityId: string, boxId: string): Promise<{
        terminationId: string;
    }>;
    findAllForBox(boxId: string): Promise<({
        sourceTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        targetTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        sourceFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
        targetFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    })[]>;
    findOne(id: string): Promise<{
        sourceTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        targetTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        sourceFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
        targetFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    }>;
    update(id: string, dto: UpdateOpticalConnectionDto): Promise<{
        sourceTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        targetTermination: {
            id: string;
            createdAt: Date;
            type: string;
            entityType: string;
            entityId: string;
            portIdentifier: string | null;
            boxId: string | null;
            odfId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        };
        sourceFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
        targetFiber: {
            number: number;
            id: string;
            color: string;
            label: string | null;
        } | null;
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    }>;
    remove(id: string): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        notes: string | null;
        connectionType: string;
        lossDb: import("@prisma/client/runtime/library").Decimal | null;
        version: number;
        sourceTerminationId: string;
        targetTerminationId: string;
        sourceFiberId: string | null;
        targetFiberId: string | null;
        spliceMethod: string | null;
        technician: string | null;
        splicedAt: Date | null;
    }>;
}
