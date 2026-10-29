import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { CreateEvaluationSchema, SaveScoresSchema } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  createEvaluation,
  deleteEvaluation,
  evaluationSheet,
  myEvaluations,
  saveScores,
} from './evaluations.js';

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TeamError) {
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Demande invalide.');
  }
  return result.data;
}

/** Évaluations notées d'une classe et carnet de notes. */
@Controller()
export class EvaluationsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('me/evaluations')
  async mine(@Req() request: Request) {
    return { items: await myEvaluations(this.db, await this.me(request)) };
  }

  @Post('cohorts/:id/evaluations')
  async create(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(CreateEvaluationSchema, body);
    return guard(async () =>
      createEvaluation(this.db, await this.me(request), id, input, request.traceId),
    );
  }

  @Get('evaluations/:id/sheet')
  async sheet(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return guard(async () => evaluationSheet(this.db, await this.me(request), id));
  }

  @Put('evaluations/:id/scores')
  async scores(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(SaveScoresSchema, body);
    await guard(async () =>
      saveScores(this.db, await this.me(request), id, input, request.traceId),
    );
    return { ok: true };
  }

  @Delete('evaluations/:id')
  @HttpCode(200)
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    await guard(async () => deleteEvaluation(this.db, await this.me(request), id, request.traceId));
    return { ok: true };
  }
}
