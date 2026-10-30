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
  Post,
  Req,
} from '@nestjs/common';
import {
  AddLearnersSchema,
  CohortTeacherSchema,
  CreateCohortSchema,
  JoinCohortSchema,
  TransferLearnersSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { IDENTITY_ADMIN, type IdentityAdmin } from '../team/identity-admin.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  addCohortTeacher,
  addLearners,
  createCohort,
  joinCohort,
  organizationCohorts,
  removeCohortTeacher,
  renewJoinCode,
  setCohortArchived,
  removeLearner,
  renewParentCode,
  rosterTools,
  transferLearners,
} from './cohort-admin.js';

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

/** Création et gestion des classes, enseignants affectés, code de classe des élèves. */
@Controller()
export class CohortAdminController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('organizations/:id/cohorts')
  async list(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return guard(async () => organizationCohorts(this.db, await this.me(request), id));
  }

  @Post('cohorts')
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateCohortSchema, body);
    return guard(async () => createCohort(this.db, await this.me(request), input, request.traceId));
  }

  @Post('cohorts/:id/teachers')
  @HttpCode(200)
  async addTeacher(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { userId } = parse(CohortTeacherSchema, body);
    await guard(async () =>
      addCohortTeacher(this.db, await this.me(request), id, userId, request.traceId),
    );
    return { added: true };
  }

  @Delete('cohorts/:id/teachers/:teacherId')
  @HttpCode(200)
  async removeTeacher(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
  ) {
    await guard(async () =>
      removeCohortTeacher(this.db, await this.me(request), id, teacherId, request.traceId),
    );
    return { removed: true };
  }

  @Post('cohorts/:id/code')
  @HttpCode(200)
  async renew(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return guard(async () => renewJoinCode(this.db, await this.me(request), id, request.traceId));
  }

  @Post('cohorts/:id/archive')
  @HttpCode(200)
  async archive(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    await guard(async () =>
      setCohortArchived(this.db, await this.me(request), id, true, request.traceId),
    );
    return { archived: true };
  }

  @Post('cohorts/:id/restore')
  @HttpCode(200)
  async restore(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    await guard(async () =>
      setCohortArchived(this.db, await this.me(request), id, false, request.traceId),
    );
    return { archived: false };
  }

  @Get('cohorts/:id/roster-tools')
  async rosterTools(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    const tools = await guard(async () => rosterTools(this.db, await this.me(request), id));
    return { ...tools, canCreateAccounts: this.identity.configured() };
  }

  @Delete('cohorts/:id/learners/:learnerId')
  @HttpCode(200)
  async removeLearner(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('learnerId', ParseUUIDPipe) learnerId: string,
  ) {
    await guard(async () =>
      removeLearner(this.db, await this.me(request), id, learnerId, request.traceId),
    );
    return { removed: true };
  }

  @Post('cohorts/:id/learners')
  async addLearners(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { learners } = parse(AddLearnersSchema, body);
    return guard(async () =>
      addLearners(this.db, this.identity, await this.me(request), id, learners, request.traceId),
    );
  }

  @Post('cohorts/:id/learners/:learnerId/parent-code')
  async parentCode(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('learnerId', ParseUUIDPipe) learnerId: string,
  ) {
    return guard(async () =>
      renewParentCode(this.db, await this.me(request), id, learnerId, request.traceId),
    );
  }

  @Post('cohorts/:id/transfer')
  @HttpCode(200)
  async transfer(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(TransferLearnersSchema, body);
    return guard(async () =>
      transferLearners(this.db, await this.me(request), id, input, request.traceId),
    );
  }

  @Post('me/join-cohort')
  @HttpCode(200)
  async join(@Req() request: Request, @Body() body: unknown) {
    const { code } = parse(JoinCohortSchema, body);
    return guard(async () => joinCohort(this.db, await this.me(request), code, request.traceId));
  }
}
