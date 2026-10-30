import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Put,
  Req,
} from '@nestjs/common';
import { SetRightsSchema, type RightsOverview } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import { setWithdrawnRights, withdrawnRights } from './rights.js';
import { teamPowers } from './team.js';

/** Écran « Droits » : le superadministrateur retire ou rend des droits aux profils d'équipe. */
@Controller('admin/rights')
export class RightsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async superadmin(request: Request): Promise<string> {
    const userId = (await this.users.resolve(request.principal as Principal)).id;
    if (!(await teamPowers(this.db, userId)).isSuper) {
      throw new ForbiddenException('Réservé au superadministrateur.');
    }
    return userId;
  }

  @Get()
  async get(@Req() request: Request): Promise<RightsOverview> {
    await this.superadmin(request);
    return { withdrawn: await withdrawnRights(this.db) };
  }

  @Put()
  async set(@Req() request: Request, @Body() body: unknown): Promise<RightsOverview> {
    const userId = await this.superadmin(request);
    const parsed = SetRightsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    return setWithdrawnRights(this.db, userId, parsed.data.withdrawn, request.traceId);
  }
}
