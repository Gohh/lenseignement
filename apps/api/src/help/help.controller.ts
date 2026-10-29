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
  Res,
} from '@nestjs/common';
import { AnswerHelpSchema, AskHelpSchema } from '@lenseignement/types';
import type { Request, Response } from 'express';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  answerHelp,
  askHelp,
  attachToQuestion,
  badge,
  HelpError,
  inbox,
  markAnswersSeen,
  myQuestions,
  readAttachment,
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

  /** Photo ou message vocal joint à une question : les octets bruts, type dans l'en-tête. */
  @Post('me/help-questions/:id/attachment/:kind')
  async attach(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
  ) {
    const user = await this.users.resolve(request.principal as Principal);
    const mime = request.headers['content-type'] ?? '';
    return guard(() => attachToQuestion(this.db, user.id, id, kind, mime, request.body as Buffer));
  }

  @Get('help-attachments/:id')
  async download(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const user = await this.users.resolve(request.principal as Principal);
    const file = await guard(() => readAttachment(this.db, user.id, id));
    response
      .set({
        'content-type': file.mime,
        'content-length': String(file.data.length),
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
      })
      .end(file.data);
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
