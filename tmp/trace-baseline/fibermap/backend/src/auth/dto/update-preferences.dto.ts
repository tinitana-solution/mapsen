import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() showLegend?: boolean;
  @IsOptional() @IsBoolean() showImportedPoles?: boolean;
  @IsOptional() @IsBoolean() confirmDestructiveActions?: boolean;
}
