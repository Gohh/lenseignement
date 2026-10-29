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
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  AccountQuerySchema,
  AuditQuerySchema,
  ImportAccountsSchema,
  SetAccountStatusSchema,
  UpdateAccountSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { IDENTITY_ADMIN, type IdentityAdmin } from '../team/identity-admin.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  auditJournal,
  deleteAccount,
  importAccounts,
  listAccounts,
  setAccountStatus,
  updateAccount,
} from './accounts.js';

const accountId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new NotFoundException('Compte introuvable.');
  return id;
};

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

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

/** Comptes (superadministrateur et administrateur) et journal des actions (superadministrateur). */
@Controller('admin')
export class AccountsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('accounts')
  async list(@Req() request: Request, @Query() query: unknown) {
    const input = parse(AccountQuerySchema, query);
    return guard(async () => listAccounts(this.db, await this.me(request), input));
  }

  @Post('accounts/:id/status')
  @HttpCode(204)
  async status(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException('Compte introuvable.');
    const { status } = parse(SetAccountStatusSchema, body);
    await guard(async () =>
      setAccountStatus(this.db, await this.me(request), id, status, request.traceId),
    );
  }

  @Post('accounts/import')
  async import(@Req() request: Request, @Body() body: unknown) {
    const { csv } = parse(ImportAccountsSchema, body);
    return guard(async () =>
      importAccounts(this.db, this.identity, await this.me(request), csv, request.traceId),
    );
  }

  @Patch('accounts/:id')
  @HttpCode(204)
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(UpdateAccountSchema, body);
    await guard(async () =>
      updateAccount(this.db, await this.me(request), accountId(id), input, request.traceId),
    );
  }

  @Delete('accounts/:id')
  async remove(@Req() request: Request, @Param('id') id: string) {
    return guard(async () =>
      deleteAccount(this.db, this.identity, await this.me(request), accountId(id), request.traceId),
    );
  }

  @Get('audit')
  async journal(@Req() request: Request, @Query() query: unknown) {
    const input = parse(AuditQuerySchema, query);
    return guard(async () => auditJournal(this.db, await this.me(request), input));
  }
}
