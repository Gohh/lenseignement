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
  Req,
} from '@nestjs/common';
import {
  CreateAssignmentSchema,
  GradeSubmissionSchema,
  SubmitAssignmentSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  createAssignment,
  deleteAssignment,
  gradeSubmission,
  myAssignments,
  reviewAssignment,
  submitAssignment,
} from './assignments.js';

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

/** Devoirs : donnés par l'enseignant à sa classe, rendus par les élèves, corrigés avec une note. */
@Controller()
export class AssignmentsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('me/assignments')
  async mine(@Req() request: Request) {
    return { items: await myAssignments(this.db, await this.me(request)) };
  }

  @Post('cohorts/:id/assignments')
  async create(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(CreateAssignmentSchema, body);
    return guard(async () =>
      createAssignment(this.db, await this.me(request), id, input, request.traceId),
    );
  }

  @Get('assignments/:id/review')
  async review(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return guard(async () => reviewAssignment(this.db, await this.me(request), id));
  }

  @Post('assignments/:id/submission')
  @HttpCode(200)
  async submit(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { body: text } = parse(SubmitAssignmentSchema, body);
    await guard(async () => submitAssignment(this.db, await this.me(request), id, text));
    return { ok: true };
  }

  @Post('submissions/:id/grade')
  @HttpCode(200)
  async grade(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(GradeSubmissionSchema, body);
    await guard(async () =>
      gradeSubmission(this.db, await this.me(request), id, input, request.traceId),
    );
    return { ok: true };
  }

  @Delete('assignments/:id')
  @HttpCode(200)
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    await guard(async () => deleteAssignment(this.db, await this.me(request), id, request.traceId));
    return { ok: true };
  }
}
