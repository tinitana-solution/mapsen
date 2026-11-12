import { PrismaService } from '../prisma/prisma.service.js';
export declare const MAX_FIBERS_PER_PORT = 2;
export interface ConnectionsTableFiber {
    id: string;
    number: number;
    numberInTube: number;
    color: string;
    status: string;
    service: string | null;
    description: string | null;
    port: number;
    links: string[];
}
export interface DeviceTerminalFiber {
    fiberId: string;
    cableId: string;
    cableCode: string;
    number: number;
    color: string;
    linkId?: string;
}
export interface FiberContinuityMapping {
    id: string;
    inputFiberId: string;
    outputFiberId: string;
}
export interface DeviceTerminal {
    key: string;
    group: string;
    label: string;
    status: string;
    splitter?: {
        id: string;
        code: string;
        name: string | null;
        ratio: string;
    };
    fibers: DeviceTerminalFiber[];
    peers: string[];
    connectionIds: string[];
    remote: RemoteEnd[];
}
export interface RemoteEnd {
    deviceType: 'ODF' | 'MANGA' | 'NAP';
    deviceId: string;
    deviceName: string;
    fiberId: string;
    fiberNumber: number;
    cableCode: string;
    portLabel: string | null;
}
export interface CableDevice {
    type: 'ODF' | 'MANGA' | 'NAP';
    id: string;
    name: string;
    fiberFrom: number;
    fiberTo: number;
}
export interface ConnectionsTableBuffer {
    number: number;
    color: string;
    fibers: ConnectionsTableFiber[];
}
export interface ConnectionsTableCable {
    cableId: string;
    code: string;
    name: string | null;
    fiberCount: number;
    role: string;
    fiberFrom: number;
    fiberTo: number;
    hasInventory: boolean;
    startNodeType: string | null;
    devices: CableDevice[];
    buffers: ConnectionsTableBuffer[];
}
export declare class ConnectionsTableService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    build(elementType: 'ODF' | 'MANGA' | 'NAP', elementId: string, odfCapacity?: number | null, includeNormalMapping?: boolean): Promise<{
        portsInUse: number;
        cables: ConnectionsTableCable[];
        terminals: DeviceTerminal[];
        fiberMappings: FiberContinuityMapping[];
    }>;
    private attachRemote;
    private portLabels;
    private boxTerminals;
}
export declare function splitterPortNumber(port: {
    portType: string;
    number: number;
}): string;
export declare function boxPortLabel(port: {
    type: string;
    number: number;
}): string;
