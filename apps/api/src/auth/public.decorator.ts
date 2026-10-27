import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Rend une route accessible sans authentification. Par défaut, toute route est protégée. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
