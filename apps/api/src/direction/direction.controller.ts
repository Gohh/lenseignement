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
import type { DirectionOverview } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import { directionOverview } from './direction.js';

const QuerySchema = z.object({
  organizationId: z.uuid().optional(),
  schoolYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/)
    .optional(),
});

/** Tableau de bord de la direction : classes, activité et élèves à suivre d'un établissement. */
@Controller('direction')
export class DirectionController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  @Get('overview')
  async overview(@Req() request: Request, @Query() query: unknown): Promise<DirectionOverview> {
    const parsed = QuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    const userId = (await this.users.resolve(request.principal as Principal)).id;
    try {
      return await directionOverview(this.db, userId, parsed.data);
    } catch (error) {
      if (error instanceof TeamError) {
        if (error.kind === 'not_found') throw new NotFoundException(error.message);
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }
}
