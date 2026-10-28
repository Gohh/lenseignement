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
  DiagnosticSubmissionSchema,
  RemediationOverrideSchema,
  type DiagnosticForm,
  type RemediationOverview,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { LearningError } from '../learning/learning.js';
import { UsersService } from '../users/users.service.js';
import {
  diagnosticForm,
  overridePlan,
  overview,
  postTestForm,
  submitDiagnostic,
  submitPostTest,
} from './remediation.js';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof LearningError) {
      if (error.kind === 'invalid') throw new BadRequestException(error.message);
      throw error.kind === 'not_found'
        ? new NotFoundException(error.message)
        : new ConflictException(error.message);
    }
    throw error;
  }
}

/**
 * Bilan de lecture et rattrapage (ADR-013). L'apprenant passe son bilan et son petit test ;
 * sa fiche montre l'orientation à son parent vérifié et au personnel de son périmètre, qui seul
 * peut la corriger.
 */
@Controller()
export class RemediationController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('diagnostics/:code')
  form(@Param('code') code: string): Promise<DiagnosticForm> {
    return run(() => diagnosticForm(this.db, code));
  }

  @Get('me/remediation/:code')
  async mine(@Req() request: Request, @Param('code') code: string): Promise<RemediationOverview> {
    const userId = await this.userId(request);
    return run(() => overview(this.db, userId, code, false));
  }

  @Post('me/remediation/:code/diagnostic')
  @HttpCode(200)
  async diagnostic(
    @Req() request: Request,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<RemediationOverview> {
    const input = parse(DiagnosticSubmissionSchema, body);
    const userId = await this.userId(request);
    return run(() => submitDiagnostic(this.db, userId, code, input));
  }

  @Get('me/remediation/:code/post-test')
  async postTest(@Req() request: Request, @Param('code') code: string): Promise<DiagnosticForm> {
    const userId = await this.userId(request);
    return run(() => postTestForm(this.db, userId, code));
  }

  @Post('me/remediation/:code/post-test')
  @HttpCode(200)
  async submitPostTest(
    @Req() request: Request,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<RemediationOverview> {
    const input = parse(DiagnosticSubmissionSchema, body);
    const userId = await this.userId(request);
    return run(() => submitPostTest(this.db, userId, code, input));
  }

  @Get('learners/:id/remediation/:code')
  async learner(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('code') code: string,
  ): Promise<RemediationOverview> {
    const userId = await this.userId(request);
    const target = {
      userId,
      action: 'remediation.read',
      resourceType: 'learner' as const,
      resourceId: id,
      traceId: request.traceId,
    };
    await this.access.assertCanRead(target);
    const canAdjust = await this.access.isInScope(target);
    return run(() => overview(this.db, id, code, canAdjust));
  }

  @Post('learners/:id/remediation/:code/override')
  @HttpCode(200)
  async override(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<RemediationOverview> {
    const userId = await this.userId(request);
    await this.access.assertCanGuide({
      userId,
      action: 'remediation.override',
      resourceType: 'learner',
      resourceId: id,
      traceId: request.traceId,
    });
    const input = parse(RemediationOverrideSchema, body);
    return run(() => overridePlan(this.db, userId, id, code, input));
  }
}
