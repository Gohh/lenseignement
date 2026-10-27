import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../auth/principal.js';

/** Identité de l'utilisateur connecté, telle que vue par l'API. */
@Controller('me')
export class MeController {
  @Get()
  get(@Req() request: Request): Principal {
    // Le garde d'authentification garantit la présence du principal sur les routes protégées.
    return request.principal as Principal;
  }
}
