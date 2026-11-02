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
  CampaignModeSchema,
  CreateCampaignSchema,
  LEVEL_CODES,
  SaveExamPaperSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { ExerciseError } from '../exercises/exercises.js';
import { UsersService } from '../users/users.service.js';
import {
  campaignBooklet,
  campaignOptions,
  campaignPaperSheet,
  closeCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  previewCampaign,
  saveCampaignPaper,
  setCampaignMode,
} from './campaigns.js';

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
const PreviewQuery = z.object({
  zone: z.union([z.literal('pays'), z.uuid()]),
  level: z.enum(LEVEL_CODES),
});

/** Campagnes d'évaluation de zone : lancer, faire passer, suivre la participation. */
@Controller('authoring/campaigns')
export class CampaignsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async list(@Req() request: Request) {
    return listCampaigns(this.db, await this.userId(request));
  }

  @Get('options')
  async options(@Req() request: Request) {
    return campaignOptions(this.db, await this.userId(request));
  }

  @Get('preview')
  async preview(
    @Req() request: Request,
    @Query('zone') zone?: string,
    @Query('level') level?: string,
  ) {
    const query = parse(PreviewQuery, { zone, level });
    const userId = await this.userId(request);
    return run(() =>
      previewCampaign(this.db, userId, query.zone === 'pays' ? null : query.zone, query.level),
    );
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateCampaignSchema, body);
    const userId = await this.userId(request);
    return run(() => createCampaign(this.db, userId, input, request.traceId));
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => getCampaign(this.db, userId, id));
  }

  @Get(':id/booklet')
  async booklet(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => campaignBooklet(this.db, userId, id));
  }

  @Put(':id/classes/:cohortId/mode')
  @HttpCode(204)
  async mode(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('cohortId') cohortId: string,
    @Body() body: unknown,
  ) {
    if (!UUID.test(cohortId)) throw new NotFoundException('Classe introuvable.');
    const input = parse(CampaignModeSchema, body);
    const userId = await this.userId(request);
    await run(() => setCampaignMode(this.db, userId, id, cohortId, input.onPaper, request.traceId));
  }

  @Get(':id/paper')
  async paper(@Req() request: Request, @Param('id') id: string, @Query('cohort') cohort?: string) {
    if (!cohort || !UUID.test(cohort)) throw new BadRequestException('Choisissez la classe.');
    const userId = await this.userId(request);
    return run(() => campaignPaperSheet(this.db, userId, id, cohort));
  }

  @Put(':id/paper')
  @HttpCode(200)
  async savePaper(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(SaveExamPaperSchema, body);
    const userId = await this.userId(request);
    return run(() => saveCampaignPaper(this.db, userId, id, input, request.traceId));
  }

  @Post(':id/close')
  @HttpCode(204)
  async close(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => closeCampaign(this.db, userId, id, request.traceId));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    await run(() => deleteCampaign(this.db, userId, id, request.traceId));
  }
}
