var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
export class CreateFiberSplitterRouteDto {
    deviceId;
    sourceFiberId;
    targetFiberId;
    splitterInputPortId;
    splitterOutputPortId;
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateFiberSplitterRouteDto.prototype, "deviceId", void 0);
__decorate([
    IsOptional(),
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateFiberSplitterRouteDto.prototype, "sourceFiberId", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateFiberSplitterRouteDto.prototype, "targetFiberId", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateFiberSplitterRouteDto.prototype, "splitterInputPortId", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateFiberSplitterRouteDto.prototype, "splitterOutputPortId", void 0);
//# sourceMappingURL=create-fiber-splitter-route.dto.js.map