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
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CreateClassSessionSchema, UpdateClassSessionSchema } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  createClassSession,
  deleteClassSession,
  mySessions,
  updateClassSession,
} from './class-sessions.js';

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

/** Classe virtuelle : séances en visio d'une classe. */
@Controller()
export class ClassSessionsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('me/class-sessions')
  async mine(@Req() request: Request) {
    return { items: await mySessions(this.db, await this.me(request)) };
  }

  @Post('cohorts/:id/sessions')
  async create(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(CreateClassSessionSchema, body);
    return guard(async () =>
      createClassSession(this.db, await this.me(request), id, input, request.traceId),
    );
  }

  @Patch('class-sessions/:id')
  async update(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(UpdateClassSessionSchema, body);
    await guard(async () => updateClassSession(this.db, await this.me(request), id, input));
    return { ok: true };
  }

  @Delete('class-sessions/:id')
  @HttpCode(200)
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    await guard(async () =>
      deleteClassSession(this.db, await this.me(request), id, request.traceId),
    );
    return { ok: true };
  }
}
