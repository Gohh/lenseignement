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
  Res,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import {
  CreateExerciseSchema,
  ExerciseAnswerSchema,
  ExerciseImportSchema,
  ExerciseReturnSchema,
  UpdateExerciseSchema,
  type ExerciseDomain,
  type ExerciseStatus,
} from '@lenseignement/types';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../auth/public.decorator.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  checkExercise,
  copyExercise,
  createExercise,
  deleteExercise,
  ExerciseError,
  getExercise,
  importExercises,
  listExerciseCompetencies,
  listExerciseOrganizations,
  listExercises,
  publishExercise,
  returnExercise,
  setExerciseArchived,
  submitExercise,
  updateExercise,
} from './exercises.js';
import { exerciseMediaFile, uploadExerciseMedia } from './media.js';

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
    if (error instanceof ExerciseError) {
      if (error.kind === 'invalid') throw new BadRequestException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      throw new ConflictException(error.message);
    }
    throw error;
  }
}

const one = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** Fabrique d'exercices : banque, rédaction, relecture, publication. */
@Controller('authoring/exercises')
export class ExercisesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async list(@Req() request: Request, @Query() query: Record<string, unknown>) {
    const userId = await this.userId(request);
    return listExercises(this.db, userId, {
      scope: query.scope === 'all' ? 'all' : 'mine',
      status: one(query.status) as ExerciseStatus | undefined,
      domain: one(query.domain) as ExerciseDomain | undefined,
      curriculumId: one(query.curriculum),
      q: one(query.q)?.slice(0, 100),
    });
  }

  @Get('organizations')
  async organizations(@Req() request: Request) {
    return { items: await listExerciseOrganizations(this.db, await this.userId(request)) };
  }

  @Get('competencies')
  async competencies() {
    return { items: await listExerciseCompetencies(this.db) };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateExerciseSchema, body);
    const userId = await this.userId(request);
    return run(() => createExercise(this.db, userId, input, request.traceId));
  }

  /** Import d'un fichier d'exercices : les exercices valables partent en relecture. */
  @Post('import')
  @HttpCode(200)
  async import(@Req() request: Request, @Body() body: unknown) {
    const input = parse(ExerciseImportSchema, body);
    const userId = await this.userId(request);
    const { created, errors } = await run(() =>
      importExercises(this.db, userId, input, 'review', request.traceId),
    );
    return { created, errors };
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => getExercise(this.db, userId, id));
  }

  @Put(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(UpdateExerciseSchema, body);
    const userId = await this.userId(request);
    return run(() => updateExercise(this.db, userId, id, input));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => deleteExercise(this.db, userId, id, request.traceId));
  }

  /** Image ou son : les octets bruts en flux (application/octet-stream). */
  @Post(':id/media')
  async media(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.userId(request);
    return run(() => uploadExerciseMedia(this.db, userId, id, request));
  }

  @Post(':id/check')
  @HttpCode(200)
  async check(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const answer = parse(ExerciseAnswerSchema, body);
    const userId = await this.userId(request);
    return run(() => checkExercise(this.db, userId, id, answer));
  }

  @Post(':id/submit')
  @HttpCode(204)
  async submit(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => submitExercise(this.db, userId, id, request.traceId));
  }

  @Post(':id/return')
  @HttpCode(204)
  async giveBack(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const { note } = parse(ExerciseReturnSchema, body);
    const userId = await this.userId(request);
    await run(() => returnExercise(this.db, userId, id, note, request.traceId));
  }

  @Post(':id/publish')
  @HttpCode(204)
  async publish(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => publishExercise(this.db, userId, id, request.traceId));
  }

  @Post(':id/archive')
  @HttpCode(204)
  async archive(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => setExerciseArchived(this.db, userId, id, true, request.traceId));
  }

  @Post(':id/restore')
  @HttpCode(204)
  async restore(@Req() request: Request, @Param('id') id: string): Promise<void> {
    const userId = await this.userId(request);
    await run(() => setExerciseArchived(this.db, userId, id, false, request.traceId));
  }

  /** Nouvelle version (exercice de sa structure) ou copie de la banque commune. */
  @Post(':id/copy')
  async copy(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId } = parse(
      z.object({ organizationId: z.uuid().nullable().default(null) }),
      body ?? {},
    );
    const userId = await this.userId(request);
    return run(() => copyExercise(this.db, userId, id, organizationId, request.traceId));
  }
}

/**
 * Images et sons des exercices. La clé aléatoire sert d'adresse (comme les fichiers H5P) : le
 * fichier peut ainsi être gardé sur l'appareil de l'élève.
 */
@Public()
@Controller('exercise-media')
export class ExerciseMediaController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get(':key')
  async file(@Param('key') key: string, @Res() response: Response) {
    const file = await exerciseMediaFile(this.db, key);
    if (!file) throw new NotFoundException('Fichier introuvable.');
    response.set({
      'content-type': file.mime,
      'content-length': String(file.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'",
      'cross-origin-resource-policy': 'same-site',
    });
    const stream = createReadStream(file.path);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  }
}
