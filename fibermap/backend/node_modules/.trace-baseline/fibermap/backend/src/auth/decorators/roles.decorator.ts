import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Restricts a route (or an entire controller) to users holding at least one of these roles.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
