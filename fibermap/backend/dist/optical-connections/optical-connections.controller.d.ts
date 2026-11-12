import { OpticalConnectionsService } from './optical-connections.service.js';
import { CreateOpticalConnectionDto } from './dto/create-optical-connection.dto.js';
import { UpdateOpticalConnectionDto } from './dto/update-optical-connection.dto.js';
import { CreateFiberLinkDto } from './dto/create-fiber-link.dto.js';
import { CreateFiberSpliceDto } from './dto/create-fiber-splice.dto.js';
import { CreateFiberSplitterRouteDto } from './dto/create-fiber-splitter-route.dto.js';
export declare class OpticalConnectionsController {
    private readonly opticalConnectionsService;
    constructor(opticalConnectionsService: OpticalConnectionsService);
    create(createOpticalConnectionDto: CreateOpticalConnectionDto): Promise<{
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
    findAll(boxId?: string): Promise<({
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
    lookupTermination(entityType?: string, entityId?: string, boxId?: string): Promise<{
        terminationId: string;
    }>;
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
    update(id: string, updateOpticalConnectionDto: UpdateOpticalConnectionDto): Promise<{
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
