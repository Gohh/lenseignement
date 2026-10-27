import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  EnrollSchema,
  LessonCompletedSchema,
  LessonOpenedSchema,
  type CourseProgress,
  type LearningPlanItem,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  enroll,
  getProgress,
  learningPlan,
  LearningError,
  lessonCompleted,
  lessonOpened,
} from './learning.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

function translate(error: unknown): never {
  if (error instanceof LearningError) {
    throw error.kind === 'not_found'
      ? new NotFoundException(error.message)
      : new ConflictException(error.message);
  }
  throw error;
}

/**
 * Inscription et progression de la personne connectée (ADR-009). Chacun ne lit et n'écrit que
 * sa propre progression : l'identité vient du jeton, jamais d'un paramètre.
 */
@Controller()
export class LearningController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Post('enrollments')
  async enroll(@Req() request: Request, @Body() body: unknown): Promise<CourseProgress> {
    const { courseId } = parse(EnrollSchema, body);
    return enroll(this.db, await this.userId(request), courseId).catch(translate);
  }

  @Get('me/learning-plan')
  async plan(@Req() request: Request): Promise<{ items: LearningPlanItem[] }> {
    return { items: await learningPlan(this.db, await this.userId(request)) };
  }

  @Get('me/courses/:id/progress')
  async progress(@Req() request: Request, @Param('id') id: string): Promise<CourseProgress> {
    if (!UUID.test(id)) throw new NotFoundException('Cours introuvable.');
    return getProgress(this.db, await this.userId(request), id).catch(translate);
  }

  @Post('me/progress/opened')
  @HttpCode(204)
  async opened(@Req() request: Request, @Body() body: unknown): Promise<void> {
    const { courseId, lessonNumber } = parse(LessonOpenedSchema, body);
    await lessonOpened(this.db, await this.userId(request), courseId, lessonNumber).catch(
      translate,
    );
  }

  @Post('me/progress/completed')
  async completed(@Req() request: Request, @Body() body: unknown): Promise<CourseProgress> {
    const { courseId, lessonNumber } = parse(LessonCompletedSchema, body);
    return lessonCompleted(this.db, await this.userId(request), courseId, lessonNumber).catch(
      translate,
    );
  }
}
