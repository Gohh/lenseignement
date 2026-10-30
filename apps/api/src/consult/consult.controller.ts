import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { CONSULT_VIEWS, ConsultQuerySchema, type ConsultView } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import { consult } from './consult.js';

/** Lecture seule des cours, classes, devoirs et évaluations (superadministrateur, administrateurs). */
@Controller('admin/consult')
export class ConsultController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  @Get(':view')
  async list(@Req() request: Request, @Param('view') view: string, @Query() query: unknown) {
    if (!(CONSULT_VIEWS as readonly string[]).includes(view)) {
      throw new NotFoundException('Vue inconnue.');
    }
    const input = ConsultQuerySchema.safeParse(query);
    if (!input.success) throw new BadRequestException(z.prettifyError(input.error));
    const userId = (await this.users.resolve(request.principal as Principal)).id;
    try {
      return await consult(this.db, userId, view as ConsultView, input.data);
    } catch (error) {
      if (error instanceof TeamError && error.kind === 'forbidden') {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }
}
