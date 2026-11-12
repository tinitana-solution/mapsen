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
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, BadRequestException } from '@nestjs/common';
import { OpticalConnectionsService } from './optical-connections.service.js';
import { CreateOpticalConnectionDto } from './dto/create-optical-connection.dto.js';
import { UpdateOpticalConnectionDto } from './dto/update-optical-connection.dto.js';
import { CreateFiberLinkDto } from './dto/create-fiber-link.dto.js';
import { CreateFiberSpliceDto } from './dto/create-fiber-splice.dto.js';
import { CreateFiberSplitterRouteDto } from './dto/create-fiber-splitter-route.dto.js';
let OpticalConnectionsController = class OpticalConnectionsController {
    opticalConnectionsService;
    constructor(opticalConnectionsService) {
        this.opticalConnectionsService = opticalConnectionsService;
    }
    create(createOpticalConnectionDto) {
        return this.opticalConnectionsService.create(createOpticalConnectionDto);
    }
    createFiberLink(dto) {
        return this.opticalConnectionsService.createFiberLink(dto);
    }
    createFiberSplice(dto) {
        return this.opticalConnectionsService.createFiberSplice(dto);
    }
    createFiberSplitterRoute(dto) {
        return this.opticalConnectionsService.createFiberSplitterRoute(dto);
    }
    findAll(boxId) {
        if (!boxId) {
            throw new BadRequestException('El parámetro boxId es requerido');
        }
        return this.opticalConnectionsService.findAllForBox(boxId);
    }
    lookupTermination(entityType, entityId, boxId) {
        if (!entityType || !entityId || !boxId) {
            throw new BadRequestException('entityType, entityId y boxId son requeridos');
        }
        return this.opticalConnectionsService.findOrCreateTerminationId(entityType, entityId, boxId);
    }
    findOne(id) {
        return this.opticalConnectionsService.findOne(id);
    }
    update(id, updateOpticalConnectionDto) {
        return this.opticalConnectionsService.update(id, updateOpticalConnectionDto);
    }
    remove(id) {
        return this.opticalConnectionsService.remove(id);
    }
};
__decorate([
    Post(),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateOpticalConnectionDto]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "create", null);
__decorate([
    Post('fiber-link'),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateFiberLinkDto]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "createFiberLink", null);
__decorate([
    Post('fiber-splice'),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateFiberSpliceDto]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "createFiberSplice", null);
__decorate([
    Post('fiber-splitter-route'),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateFiberSplitterRouteDto]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "createFiberSplitterRoute", null);
__decorate([
    Get(),
    __param(0, Query('boxId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "findAll", null);
__decorate([
    Get('termination-lookup'),
    __param(0, Query('entityType')),
    __param(1, Query('entityId')),
    __param(2, Query('boxId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "lookupTermination", null);
__decorate([
    Get(':id'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "findOne", null);
__decorate([
    Patch(':id'),
    __param(0, Param('id')),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateOpticalConnectionDto]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "update", null);
__decorate([
    Delete(':id'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OpticalConnectionsController.prototype, "remove", null);
OpticalConnectionsController = __decorate([
    Controller('optical-connections'),
    __metadata("design:paramtypes", [OpticalConnectionsService])
], OpticalConnectionsController);
export { OpticalConnectionsController };
//# sourceMappingURL=optical-connections.controller.js.map