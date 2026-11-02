import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GenerateExercisesSchema, UpdateAiSettingsSchema } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  AiError,
  aiStatus,
  generateExercises,
  getAiSettings,
  saveAiSettings,
  testAi,
} from './ai.js';

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
    if (error instanceof AiError) {
      if (error.kind === 'invalid') throw new BadRequestException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      if (error.kind === 'unavailable') throw new ServiceUnavailableException(error.message);
      throw new ConflictException(error.message);
    }
    throw error;
  }
}

/** Réglages de l'IA (superadministrateur) et propositions d'exercices (Fabrique). */
@Controller()
export class AiController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('admin/ai')
  async settings(@Req() request: Request) {
    const userId = await this.userId(request);
    return run(() => getAiSettings(this.db, userId));
  }

  @Put('admin/ai')
  async save(@Req() request: Request, @Body() body: unknown) {
    const input = parse(UpdateAiSettingsSchema, body);
    const userId = await this.userId(request);
    return run(() => saveAiSettings(this.db, userId, input, request.traceId));
  }

  @Post('admin/ai/test')
  @HttpCode(200)
  async test(@Req() request: Request) {
    const userId = await this.userId(request);
    return run(() => testAi(this.db, userId));
  }

  @Get('authoring/ai')
  async status(@Req() request: Request) {
    await this.userId(request);
    return aiStatus(this.db);
  }

  @Post('authoring/ai/exercises')
  @HttpCode(200)
  async generate(@Req() request: Request, @Body() body: unknown) {
    const input = parse(GenerateExercisesSchema, body);
    const userId = await this.userId(request);
    return run(() => generateExercises(this.db, userId, input, request.traceId));
  }
}
