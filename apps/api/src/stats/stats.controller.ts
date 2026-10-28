import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { StatsOverview } from '@lenseignement/types';
import type { Request } from 'express';
import { AccessService, STATS_ROLES } from '../access/access.service.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import { statsOverview } from './stats.js';

/**
 * Tableau de chiffres anonymes (ADR-016) : direction d'établissement et référents, pour leurs
 * structures. Chaque consultation, accordée ou refusée, est journalisée.
 */
@Controller('stats')
export class StatsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  @Get('overview')
  async overview(@Req() request: Request): Promise<StatsOverview> {
    const userId = (await this.users.resolve(request.principal as Principal)).id;
    await this.access.assertHasAnyRole(
      { userId, action: 'stats.read', traceId: request.traceId },
      STATS_ROLES,
    );
    return statsOverview(this.db, userId);
  }
}
