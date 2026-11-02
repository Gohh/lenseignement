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
import {
  CreateOralCampaignSchema,
  CreateOralTestSchema,
  SaveOralBenchmarksSchema,
  SaveOralResultSchema,
  SaveOralTestSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { ExerciseError } from '../exercises/exercises.js';
import { UsersService } from '../users/users.service.js';
import {
  closeOralCampaign,
  createOralCampaign,
  deleteOralCampaign,
  getOralCampaign,
  listOralCampaigns,
  oralCampaignOptions,
  oralCampaignResults,
  statsOralCampaigns,
} from './campaigns.js';
import {
  copyOralTest,
  createOralTest,
  deleteOralTest,
  getOralTest,
  listOralBenchmarks,
  oralClassResults,
  oralOverview,
  oralSheet,
  publishOralTest,
  saveOralBenchmarks,
  saveOralResult,
  updateOralTest,
} from './oral.js';

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

const Pair = z.object({
  test: z.uuid({ message: 'Choisissez l’épreuve.' }),
  cohort: z.uuid({ message: 'Choisissez la classe.' }),
});

/** Évaluations orales chronométrées : rédiger, faire passer, lire les résultats de la classe. */
@Controller('oral')
export class OralController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async overview(@Req() request: Request) {
    return oralOverview(this.db, await this.userId(request));
  }

  @Get('campaigns')
  async campaigns(@Req() request: Request) {
    return listOralCampaigns(this.db, await this.userId(request));
  }

  @Get('campaigns/options')
  async campaignOptions(@Req() request: Request) {
    return oralCampaignOptions(this.db, await this.userId(request));
  }

  /** Campagnes orales visibles dans le tableau de pilotage. */
  @Get('campaigns/stats')
  async campaignStats(@Req() request: Request) {
    return { items: await statsOralCampaigns(this.db, await this.userId(request)) };
  }

  @Post('campaigns')
  async createCampaign(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateOralCampaignSchema, body);
    const userId = await this.userId(request);
    return run(() => createOralCampaign(this.db, userId, input, request.traceId));
  }

  @Get('campaigns/:id')
  async campaign(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => getOralCampaign(this.db, userId, id));
  }

  @Get('campaigns/:id/results')
  async campaignResults(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => oralCampaignResults(this.db, userId, id));
  }

  @Post('campaigns/:id/close')
  @HttpCode(204)
  async closeCampaign(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => closeOralCampaign(this.db, userId, id, request.traceId));
  }

  @Delete('campaigns/:id')
  @HttpCode(204)
  async deleteCampaign(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => deleteOralCampaign(this.db, userId, id, request.traceId));
  }

  @Get('benchmarks')
  async benchmarks() {
    return { items: await listOralBenchmarks(this.db) };
  }

  @Put('benchmarks')
  async saveBenchmarks(@Req() request: Request, @Body() body: unknown) {
    const input = parse(SaveOralBenchmarksSchema, body);
    const userId = await this.userId(request);
    return {
      items: await run(() => saveOralBenchmarks(this.db, userId, input.items, request.traceId)),
    };
  }

  @Get('sheet')
  async sheet(
    @Req() request: Request,
    @Query('test') test?: string,
    @Query('cohort') cohort?: string,
  ) {
    const q = parse(Pair, { test, cohort });
    const userId = await this.userId(request);
    return run(() => oralSheet(this.db, userId, q.test, q.cohort));
  }

  @Get('results')
  async results(
    @Req() request: Request,
    @Query('test') test?: string,
    @Query('cohort') cohort?: string,
  ) {
    const q = parse(Pair, { test, cohort });
    const userId = await this.userId(request);
    return run(() => oralClassResults(this.db, userId, q.test, q.cohort));
  }

  @Post('results')
  @HttpCode(200)
  async saveResult(@Req() request: Request, @Body() body: unknown) {
    const input = parse(SaveOralResultSchema, body);
    const userId = await this.userId(request);
    return run(() => saveOralResult(this.db, userId, input, request.traceId));
  }

  @Post('tests')
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateOralTestSchema, body);
    const userId = await this.userId(request);
    return run(() => createOralTest(this.db, userId, input, request.traceId));
  }

  @Get('tests/:id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => getOralTest(this.db, userId, id));
  }

  @Put('tests/:id')
  @HttpCode(204)
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(SaveOralTestSchema, body);
    const userId = await this.userId(request);
    await run(() => updateOralTest(this.db, userId, id, input, request.traceId));
  }

  @Post('tests/:id/publish')
  @HttpCode(204)
  async publish(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => publishOralTest(this.db, userId, id, request.traceId));
  }

  @Post('tests/:id/copy')
  async copy(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => copyOralTest(this.db, userId, id, request.traceId));
  }

  @Delete('tests/:id')
  @HttpCode(204)
  async remove(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => deleteOralTest(this.db, userId, id, request.traceId));
  }
}
