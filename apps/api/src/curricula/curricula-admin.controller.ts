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
  Req,
} from '@nestjs/common';
import { ImportCurriculumSchema, PublishCurriculumSchema } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  curriculaOverview,
  curriculumVersionDetail,
  deleteCurriculumDraft,
  importCurriculumJson,
  publishCurriculum,
} from './curricula-admin.js';
import { CurriculumError } from './curricula.js';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TeamError) {
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      throw new BadRequestException(error.message);
    }
    if (error instanceof CurriculumError) {
      throw error.kind === 'not_found'
        ? new NotFoundException(error.message)
        : new ConflictException(error.message);
    }
    throw error;
  }
}

/** Écran « Programmes » de l'administration : brouillons, import, publication datée. */
@Controller('admin/curricula')
export class CurriculaAdminController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async overview(@Req() request: Request) {
    return guard(async () => curriculaOverview(this.db, await this.me(request)));
  }

  @Post()
  async import(@Req() request: Request, @Body() body: unknown) {
    const { json } = parse(ImportCurriculumSchema, body);
    return guard(async () =>
      importCurriculumJson(this.db, await this.me(request), json, request.traceId),
    );
  }

  @Get(':code/versions/:label')
  async detail(
    @Req() request: Request,
    @Param('code') code: string,
    @Param('label') label: string,
  ) {
    return guard(async () => curriculumVersionDetail(this.db, await this.me(request), code, label));
  }

  @Post(':code/versions/:label/publish')
  @HttpCode(204)
  async publish(
    @Req() request: Request,
    @Param('code') code: string,
    @Param('label') label: string,
    @Body() body: unknown,
  ) {
    const { effectiveFrom } = parse(PublishCurriculumSchema, body);
    await guard(async () =>
      publishCurriculum(
        this.db,
        await this.me(request),
        code,
        label,
        effectiveFrom,
        request.traceId,
      ),
    );
  }

  @Delete(':code/versions/:label')
  @HttpCode(204)
  async remove(
    @Req() request: Request,
    @Param('code') code: string,
    @Param('label') label: string,
  ) {
    await guard(async () =>
      deleteCurriculumDraft(this.db, await this.me(request), code, label, request.traceId),
    );
  }
}
