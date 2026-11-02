import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { CreateExamSchema, GiveExamSchema, UpdateExamSchema } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { ExerciseError } from '../exercises/exercises.js';
import { UsersService } from '../users/users.service.js';
import {
  createExam,
  deleteExam,
  examResults,
  getExam,
  giveExam,
  listExams,
  reassembleExam,
  removeExamItem,
  replaceExamItem,
  updateExam,
} from './exams.js';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Formulaire incomplet.');
  }
  return result.data;
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ExerciseError) {
      if (error.kind === 'invalid') throw new BadRequestException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      throw new ConflictException(error.message);
    }
    throw error;
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Épreuves type PASEC, TIMSS, ENIA : composer, ajuster, donner aux classes, lire les résultats. */
@Controller('authoring/exams')
export class ExamsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async list(@Req() request: Request) {
    return { items: await listExams(this.db, await this.userId(request)) };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateExamSchema, body);
    const userId = await this.userId(request);
    return run(() => createExam(this.db, userId, input, request.traceId));
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => getExam(this.db, userId, id));
  }

  @Put(':id')
  @HttpCode(204)
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(UpdateExamSchema, body);
    const userId = await this.userId(request);
    await run(() => updateExam(this.db, userId, id, input, request.traceId));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => deleteExam(this.db, userId, id, request.traceId));
  }

  @Post(':id/assemble')
  @HttpCode(204)
  async assemble(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => reassembleExam(this.db, userId, id, request.traceId));
  }

  @Post(':id/items/:exerciseId/replace')
  @HttpCode(204)
  async replace(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
  ) {
    if (!UUID.test(exerciseId)) throw new NotFoundException('Question introuvable.');
    const userId = await this.userId(request);
    await run(() => replaceExamItem(this.db, userId, id, exerciseId, request.traceId));
  }

  @Delete(':id/items/:exerciseId')
  @HttpCode(204)
  async removeItem(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
  ) {
    if (!UUID.test(exerciseId)) throw new NotFoundException('Question introuvable.');
    const userId = await this.userId(request);
    await run(() => removeExamItem(this.db, userId, id, exerciseId, request.traceId));
  }

  @Post(':id/give')
  @HttpCode(200)
  async give(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(GiveExamSchema, body);
    const userId = await this.userId(request);
    return run(() => giveExam(this.db, userId, id, input, request.traceId));
  }

  @Get(':id/results')
  async results(
    @Req() request: Request,
    @Param('id') id: string,
    @Query('cohort') cohort?: string,
  ) {
    const userId = await this.userId(request);
    return run(() =>
      examResults(this.db, userId, id, cohort && UUID.test(cohort) ? cohort : undefined),
    );
  }
}
