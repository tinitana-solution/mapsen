var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { TraceService } from './trace.service.js';
let TraceController = class TraceController {
    traceService;
    constructor(traceService) {
        this.traceService = traceService;
    }
    trace(type, id, fiberId) {
        if (type !== 'odf' && type !== 'box')
            throw new BadRequestException('Tipo de dispositivo no válido');
        return this.traceService.traceDevice(type, id, fiberId);
    }
};
__decorate([
    Get(':type/:id'),
    __param(0, Param('type')),
    __param(1, Param('id')),
    __param(2, Query('fiberId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], TraceController.prototype, "trace", null);
TraceController = __decorate([
    Controller('trace'),
    __metadata("design:paramtypes", [TraceService])
], TraceController);
export { TraceController };
//# sourceMappingURL=trace.controller.js.map