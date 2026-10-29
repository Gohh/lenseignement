import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  approvePromotion,
  declinePromotion,
  PromotionError,
  promotionOf,
  requestPromotion,
} from './promotion.js';

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PromotionError) {
      throw error.kind === 'not_found'
        ? new NotFoundException(error.message)
        : new BadRequestException(error.message);
    }
    throw error;
  }
}

/** Passage au niveau supérieur : demande de l'apprenant, validation du parent ou de l'enseignant. */
@Controller()
export class PromotionController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  @Get('me/promotion')
  async mine(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return guard(() => promotionOf(this.db, user.id, false));
  }

  @Post('me/level-request')
  async request(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return guard(() => requestPromotion(this.db, user.id, request.traceId));
  }

  @Get('learners/:id/promotion')
  async ofLearner(@Req() request: Request, @Param('id') id: string) {
    const user = await this.users.resolve(request.principal as Principal);
    const ref = {
      userId: user.id,
      action: 'learner.promotion.read',
      resourceType: 'learner' as const,
      resourceId: id,
      traceId: request.traceId,
    };
    await this.access.assertCanRead(ref);
    const canDecide = await this.access.canDecideLevel(ref);
    return guard(() => promotionOf(this.db, id, canDecide));
  }

  @Post('learners/:id/promotion/approve')
  async approve(@Req() request: Request, @Param('id') id: string) {
    const user = await this.users.resolve(request.principal as Principal);
    await this.access.assertCanDecideLevel({
      userId: user.id,
      action: 'learner.promotion.approve',
      resourceType: 'learner',
      resourceId: id,
      traceId: request.traceId,
    });
    return guard(() => approvePromotion(this.db, id, user.id, request.traceId));
  }

  @Post('learners/:id/promotion/decline')
  async decline(@Req() request: Request, @Param('id') id: string) {
    const user = await this.users.resolve(request.principal as Principal);
    await this.access.assertCanDecideLevel({
      userId: user.id,
      action: 'learner.promotion.decline',
      resourceType: 'learner',
      resourceId: id,
      traceId: request.traceId,
    });
    await guard(() => declinePromotion(this.db, id, user.id, request.traceId));
    return { declined: true };
  }
}
