import { TraceService } from './trace.service.js';
export declare class TraceController {
    private readonly traceService;
    constructor(traceService: TraceService);
    trace(type: string, id: string, fiberId?: string): Promise<{
        device: {
            kind: "ODF" | "MANGA" | "NAP";
            id: string;
            name: string;
        };
        fibers: import("./trace.service.js").TracedFiber[];
    }>;
}
