import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  CreateChildSchema,
  CreateInvitationSchema,
  RedeemInvitationSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  createChild,
  createInvitation,
  FamilyError,
  listChildren,
  listTutored,
  redeemInvitation,
  revokeTutor,
} from './family.js';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FamilyError) {
      throw error.kind === 'not_found'
        ? new NotFoundException(error.message)
        : new BadRequestException(error.message);
    }
    throw error;
  }
}

/**
 * Famille (ADR-020) : le parent ajoute ses enfants et confie des enfants à un répétiteur ;
 * le répétiteur n'a qu'un accès en lecture, retirable à tout moment.
 */
@Controller('family')
export class FamilyController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('children')
  async children(@Req() request: Request) {
    return { items: await listChildren(this.db, await this.me(request)) };
  }

  @Post('children')
  async addChild(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateChildSchema, body);
    return guard(async () => createChild(this.db, await this.me(request), input, request.traceId));
  }

  @Post('invitations')
  async invite(@Req() request: Request, @Body() body: unknown) {
    const { learnerIds } = parse(CreateInvitationSchema, body);
    return guard(async () =>
      createInvitation(this.db, await this.me(request), learnerIds, request.traceId),
    );
  }

  @Post('invitations/redeem')
  async redeem(@Req() request: Request, @Body() body: unknown) {
    const { code } = parse(RedeemInvitationSchema, body);
    return guard(async () =>
      redeemInvitation(this.db, await this.me(request), code, request.traceId),
    );
  }

  @Delete('tutors/:linkId')
  async revoke(@Req() request: Request, @Param('linkId') linkId: string) {
    if (!z.string().uuid().safeParse(linkId).success) {
      throw new NotFoundException('Accès introuvable.');
    }
    await guard(async () => revokeTutor(this.db, await this.me(request), linkId, request.traceId));
    return { ok: true };
  }

  @Get('tutored')
  async tutored(@Req() request: Request) {
    return { items: await listTutored(this.db, await this.me(request)) };
  }
}
