var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
const TERMINATION_TYPES = ['BOX_PORT', 'SPLITTER_INPUT', 'SPLITTER_OUTPUT'];
const CONNECTION_TYPES = ['SPLICE', 'CONNECTOR', 'PATCH', 'DIRECT', 'SPLITTER_LINK', 'OTHER'];
export class CreateOpticalConnectionDto {
    boxId;
    sourceType;
    sourceId;
    targetType;
    targetId;
    sourceFiberId;
    targetFiberId;
    connectionType;
    lossDb;
    notes;
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "boxId", void 0);
__decorate([
    IsIn(TERMINATION_TYPES),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "sourceType", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "sourceId", void 0);
__decorate([
    IsIn(TERMINATION_TYPES),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "targetType", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "targetId", void 0);
__decorate([
    IsOptional(),
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "sourceFiberId", void 0);
__decorate([
    IsOptional(),
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "targetFiberId", void 0);
__decorate([
    IsOptional(),
    IsIn(CONNECTION_TYPES),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "connectionType", void 0);
__decorate([
    IsOptional(),
    IsNumber(),
    __metadata("design:type", Number)
], CreateOpticalConnectionDto.prototype, "lossDb", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", String)
], CreateOpticalConnectionDto.prototype, "notes", void 0);
//# sourceMappingURL=create-optical-connection.dto.js.map