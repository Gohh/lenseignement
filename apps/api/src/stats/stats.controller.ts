import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Query,
  Req,
} from '@nestjs/common';
import {
  PILOT_CYCLES,
  PILOT_PERIODS,
  type PilotOverview,
  type StatsOverview,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import { AccessService, STATS_READER_ROLES } from '../access/access.service.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { teamPowers } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import { TeamError } from '../team/team.js';
import { pilotOverview } from './pilotage.js';
import { statsOverview } from './stats.js';

const PilotQuery = z.object({
  zone: z.uuid().optional(),
  cycle: z.enum(PILOT_CYCLES).optional(),
  periode: z.enum(PILOT_PERIODS).default('30'),
});

/**
 * Tableau de chiffres anonymes (ADR-016) : direction d'établissement et référents, pour leurs
 * structures ; superadministrateur et administrateur, pour toutes. Chaque consultation, accordée ou refusée, est journalisée.
 */
@Controller('stats')
export class StatsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  /** Lecteur autorisé (rôle, puis droit de l'écran « Droits ») ; chaque demande est journalisée. */
  private async reader(request: Request): Promise<string> {
    const userId = (await this.users.resolve(request.principal as Principal)).id;
    await this.access.assertHasAnyRole(
      { userId, action: 'stats.read', traceId: request.traceId },
      STATS_READER_ROLES,
    );
    if (!(await teamPowers(this.db, userId)).rights.has('statistiques')) {
      throw new ForbiddenException('Les statistiques vous ont été retirées.');
    }
    return userId;
  }

  @Get('overview')
  async overview(@Req() request: Request): Promise<StatsOverview> {
    return statsOverview(this.db, await this.reader(request));
  }

  /** Tableau de pilotage : zone, cycle et période au choix (?zone=&cycle=&periode=). */
  @Get('pilotage')
  async pilotage(@Req() request: Request, @Query() query: unknown): Promise<PilotOverview> {
    const parsed = PilotQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    const userId = await this.reader(request);
    try {
      return await pilotOverview(this.db, userId, {
        zone: parsed.data.zone,
        cycle: parsed.data.cycle,
        period: parsed.data.periode,
      });
    } catch (error) {
      if (error instanceof TeamError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
