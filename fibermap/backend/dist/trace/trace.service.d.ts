import { PrismaService } from '../prisma/prisma.service.js';
import { ConnectionsTableService } from '../cables/connections-table.service.js';
type DeviceKind = 'ODF' | 'MANGA' | 'NAP';
export interface TraceStep {
    id: number;
    parent: number | null;
    how: 'origin' | 'cable' | 'splice' | 'splitter';
    deviceType: DeviceKind;
    deviceId: string;
    deviceName: string;
    portLabel: string | null;
    fiberId: string;
    cableId: string;
    cableCode: string;
    fiberNumber: number;
    fiberColor: string;
}
export interface TracedFiber {
    fiberId: string;
    cableId: string;
    cableCode: string;
    number: number;
    color: string;
    status: string;
    service: string | null;
    steps: TraceStep[];
    truncated: boolean;
}
export declare class TraceService {
    private readonly prisma;
    private readonly connectionsTable;
    constructor(prisma: PrismaService, connectionsTable: ConnectionsTableService);
    traceDevice(type: 'odf' | 'box', id: string, fiberId?: string): Promise<{
        device: {
            kind: DeviceKind;
            id: string;
            name: string;
        };
        fibers: TracedFiber[];
    }>;
}
export {};
