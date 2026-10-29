import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { SendMessageSchema, StartConversationSchema } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  contacts,
  myConversations,
  openConversation,
  sendMessage,
  startConversation,
} from './messages.js';

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

/** Messages entre parents et enseignants. */
@Controller()
export class MessagesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('me/message-contacts')
  async contacts(@Req() request: Request) {
    return { items: await contacts(this.db, await this.me(request)) };
  }

  @Get('me/conversations')
  async mine(@Req() request: Request) {
    return { items: await myConversations(this.db, await this.me(request)) };
  }

  @Post('conversations')
  async start(@Req() request: Request, @Body() body: unknown) {
    const input = parse(StartConversationSchema, body);
    return guard(async () => startConversation(this.db, await this.me(request), input));
  }

  @Get('conversations/:id')
  async open(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return guard(async () => openConversation(this.db, await this.me(request), id));
  }

  @Post('conversations/:id/messages')
  async send(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(SendMessageSchema, body);
    await guard(async () => sendMessage(this.db, await this.me(request), id, input.body));
    return { ok: true };
  }
}
