import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  BranchCodeSchema,
  type CurriculumDetail,
  type CurriculumSummary,
  type CurriculumVersionSummary,
} from '@lenseignement/types';
import { Public } from '../auth/public.decorator.js';
import { DATABASE, type Database } from '../db/database.js';
import {
  CurriculumError,
  getCurriculumOn,
  isIsoDate,
  listCurricula,
  listCurriculumVersions,
  today,
} from './curricula.js';

function parseDate(value: string | undefined): string {
  if (value === undefined) return today();
  if (!isIsoDate(value))
    throw new BadRequestException('Date invalide (format attendu : AAAA-MM-JJ).');
  return value;
}

function translate(error: unknown): never {
  if (error instanceof CurriculumError) {
    throw error.kind === 'not_found'
      ? new NotFoundException(error.message)
      : new ConflictException(error.message);
  }
  throw error;
}

/**
 * Programmes publiés, en lecture publique. Les brouillons ne sont jamais exposés.
 * `?date=AAAA-MM-JJ` donne la version en vigueur à cette date (aujourd'hui par défaut).
 */
@Public()
@Controller('catalog/curricula')
export class CurriculaController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  async list(
    @Query('branch') branch?: string,
    @Query('date') date?: string,
  ): Promise<{ items: CurriculumSummary[] }> {
    if (branch !== undefined && !BranchCodeSchema.safeParse(branch).success) {
      throw new BadRequestException('Branche inconnue.');
    }
    return { items: await listCurricula(this.db, branch, parseDate(date)) };
  }

  @Get(':code')
  async get(@Param('code') code: string, @Query('date') date?: string): Promise<CurriculumDetail> {
    return getCurriculumOn(this.db, code, parseDate(date)).catch(translate);
  }

  @Get(':code/versions')
  async versions(@Param('code') code: string): Promise<{ items: CurriculumVersionSummary[] }> {
    return { items: await listCurriculumVersions(this.db, code).catch(translate) };
  }
}
