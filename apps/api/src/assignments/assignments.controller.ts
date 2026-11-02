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
  Query,
  Req,
} from '@nestjs/common';
import {
  AddAssignmentExerciseSchema,
  AssignmentAnswersSchema,
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
import {
  addAssignmentExercise,
  answerAssignment,
  assignmentWork,
  exerciseCandidates,
  removeAssignmentExercise,
} from './assignment-exercises.js';

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

  /** Exercices publiés de la banque qu'on peut ajouter au devoir. */
  @Get('assignments/:id/exercise-candidates')
  async candidates(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('q') q?: string,
    @Query('domain') domain?: string,
  ) {
    return guard(async () => ({
      items: await exerciseCandidates(this.db, await this.me(request), id, {
        q: typeof q === 'string' ? q : undefined,
        domain: typeof domain === 'string' ? domain : undefined,
      }),
    }));
  }

  @Post('assignments/:id/exercises')
  @HttpCode(200)
  async addExercise(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { exerciseId } = parse(AddAssignmentExerciseSchema, body);
    await guard(async () =>
      addAssignmentExercise(this.db, await this.me(request), id, exerciseId, request.traceId),
    );
    return { ok: true };
  }

  @Delete('assignments/:id/exercises/:exerciseId')
  @HttpCode(200)
  async removeExercise(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
  ) {
    await guard(async () =>
      removeAssignmentExercise(this.db, await this.me(request), id, exerciseId, request.traceId),
    );
    return { ok: true };
  }

  /** Les exercices du devoir, sans corrigé (élève, ou enseignant en aperçu). */
  @Get('assignments/:id/work')
  async work(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return guard(async () => assignmentWork(this.db, await this.me(request), id));
  }

  /** L'élève rend ses réponses ; la plateforme corrige et note. */
  @Post('assignments/:id/answers')
  @HttpCode(200)
  async answer(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(AssignmentAnswersSchema, body);
    return guard(async () => answerAssignment(this.db, await this.me(request), id, input));
  }

  @Delete('assignments/:id')
  @HttpCode(200)
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    await guard(async () => deleteAssignment(this.db, await this.me(request), id, request.traceId));
    return { ok: true };
  }
}
