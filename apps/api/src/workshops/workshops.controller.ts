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
  Req,
  Res,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import {
  CreateWorkshopSchema,
  UpdateWorkshopSchema,
  WorkshopReturnSchema,
} from '@lenseignement/types';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import { h5pFile, uploadH5P } from './h5p.js';
import {
  createWorkshop,
  deleteWorkshop,
  getWorkshop,
  listWorkshopCompetencies,
  listWorkshopOrganizations,
  listWorkshops,
  publishWorkshop,
  reopenWorkshop,
  returnWorkshop,
  setWorkshopArchived,
  submitWorkshop,
  updateWorkshop,
  workshopCatalog,
  WorkshopError,
} from './workshops.js';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BadRequestException(first?.message ?? 'Formulaire incomplet.');
  }
  return result.data;
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof WorkshopError) {
      if (error.kind === 'invalid') throw new BadRequestException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      throw new ConflictException(error.message);
    }
    throw error;
  }
}

/** Catalogue des ateliers de l'élève. */
@Controller('me/workshops')
export class MyWorkshopsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return { items: await workshopCatalog(this.db, user.id) };
  }
}

/** Rédaction, relecture et publication des ateliers (structures de la personne). */
@Controller('authoring/workshops')
export class WorkshopsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async list(@Req() request: Request) {
    return { items: await listWorkshops(this.db, await this.userId(request)) };
  }

  @Get('organizations')
  async organizations(@Req() request: Request) {
    return { items: await listWorkshopOrganizations(this.db, await this.userId(request)) };
  }

  @Get('competencies')
  async competencies() {
    return { items: await listWorkshopCompetencies(this.db) };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateWorkshopSchema, body);
    const userId = await this.userId(request);
    return run(() => createWorkshop(this.db, userId, input, request.traceId));
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => getWorkshop(this.db, userId, id));
  }

  @Put(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(UpdateWorkshopSchema, body);
    const userId = await this.userId(request);
    return run(() => updateWorkshop(this.db, userId, id, input));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => deleteWorkshop(this.db, userId, id, request.traceId));
  }

  /** Fichier .h5p : les octets bruts en flux (application/octet-stream). */
  @Post(':id/h5p')
  async h5p(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => uploadH5P(this.db, userId, id, request));
  }

  @Post(':id/reopen')
  @HttpCode(204)
  async reopen(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => reopenWorkshop(this.db, userId, id));
  }

  @Post(':id/submit')
  @HttpCode(204)
  async submit(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => submitWorkshop(this.db, userId, id, request.traceId));
  }

  @Post(':id/return')
  @HttpCode(204)
  async giveBack(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const { note } = parse(WorkshopReturnSchema, body);
    const userId = await this.userId(request);
    await run(() => returnWorkshop(this.db, userId, id, note, request.traceId));
  }

  @Post(':id/publish')
  @HttpCode(204)
  async publish(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => publishWorkshop(this.db, userId, id, request.traceId));
  }

  @Post(':id/archive')
  @HttpCode(204)
  async archive(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => setWorkshopArchived(this.db, userId, id, true, request.traceId));
  }

  @Post(':id/restore')
  @HttpCode(204)
  async restore(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => setWorkshopArchived(this.db, userId, id, false, request.traceId));
  }
}

/**
 * Fichiers des exercices H5P, pour le lecteur isolé (origine opaque, donc sans session) : la clé
 * aléatoire du paquet fait office d'adresse. Un fichier ouvert seul reste dans un bac à sable.
 */
@Public()
@Controller('h5p-files')
export class H5PFilesController {
  @Get(':key/*path')
  async file(
    @Param('key') key: string,
    @Param('path') path: string | string[],
    @Res() response: Response,
  ) {
    const file = await h5pFile(key, Array.isArray(path) ? path.join('/') : String(path));
    if (!file) throw new NotFoundException('Fichier introuvable.');
    response.set({
      'content-type': file.type,
      'content-length': String(file.size),
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox allow-scripts',
      'cross-origin-resource-policy': 'cross-origin',
    });
    const stream = createReadStream(file.path);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  }
}
