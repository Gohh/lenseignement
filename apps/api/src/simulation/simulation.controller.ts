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
import { SimulationSubmissionSchema, type SimulationOverview } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { LearningError } from '../learning/learning.js';
import { UsersService } from '../users/users.service.js';
import { overview, requestPractice, submitAttempt } from './simulation.js';

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
 * Atelier virtuel (ADR-014) : l'apprenant fait la simulation de sécurité, puis, réussie, demande
 * sa séance pratique encadrée. Chacun ne voit et n'écrit que ses propres essais.
 */
@Controller('me/simulations/:code')
export class SimulationController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async userId(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async mine(@Req() request: Request, @Param('code') code: string): Promise<SimulationOverview> {
    const userId = await this.userId(request);
    return run(() => overview(this.db, userId, code));
  }

  @Post('attempts')
  @HttpCode(200)
  async attempt(
    @Req() request: Request,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<SimulationOverview> {
    const parsed = SimulationSubmissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    const userId = await this.userId(request);
    return run(() => submitAttempt(this.db, userId, code, parsed.data));
  }

  @Post('practice-request')
  @HttpCode(200)
  async practice(
    @Req() request: Request,
    @Param('code') code: string,
  ): Promise<SimulationOverview> {
    const userId = await this.userId(request);
    return run(() => requestPractice(this.db, userId, code));
  }
}
