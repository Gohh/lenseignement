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
import { AnswerHelpSchema, AskHelpSchema } from '@lenseignement/types';
import type { Request } from 'express';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  answerHelp,
  askHelp,
  badge,
  HelpError,
  inbox,
  markAnswersSeen,
  myQuestions,
} from './help.js';

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HelpError) {
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

function parse<T>(
  schema: {
    safeParse(
      v: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
  },
  body: unknown,
): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Demande invalide.');
  return result.data;
}

/** Aide et tutorat : questions des apprenants, réponses de leur enseignant ou répétiteur. */
@Controller()
export class HelpController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  @Post('me/help-questions')
  async ask(@Req() request: Request, @Body() body: unknown) {
    const user = await this.users.resolve(request.principal as Principal);
    const input = parse(AskHelpSchema, body);
    return guard(() => askHelp(this.db, user.id, input));
  }

  @Get('me/help-questions')
  async mine(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return { items: await myQuestions(this.db, user.id) };
  }

  @Post('me/help-questions/seen')
  async seen(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    await markAnswersSeen(this.db, user.id);
    return { seen: true };
  }

  @Get('me/help-badge')
  async badge(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return badge(this.db, user.id);
  }

  @Get('help/inbox')
  async inbox(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return { items: await inbox(this.db, user.id) };
  }

  @Post('help/questions/:id/answer')
  async answer(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const user = await this.users.resolve(request.principal as Principal);
    const input = parse(AnswerHelpSchema, body);
    await guard(() => answerHelp(this.db, user.id, id, input.answer));
    return { answered: true };
  }
}
