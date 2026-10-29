import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  CreateAccountSchema,
  CreateOrganizationSchema,
  ImportOrganizationsSchema,
  CreateTeamInvitationSchema,
  RedeemTeamInvitationSchema,
  UpdateTeamMemberSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import { IDENTITY_ADMIN, type IdentityAdmin } from './identity-admin.js';
import { createOrganization, importOrganizations } from './organizations.js';
import {
  createAccount,
  createTeamInvitation,
  redeemTeamInvitation,
  removeMember,
  TeamError,
  teamOverview,
  updateMemberBranches,
} from './team.js';

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

const memberId = (id: string) => {
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundException('Membre introuvable.');
  return id;
};

/** Équipe d'une structure (ADR-021) : invitations par code, cycles accordés, retrait d'un rôle. */
@Controller('team')
export class TeamController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async overview(@Req() request: Request) {
    return teamOverview(this.db, await this.me(request));
  }

  @Post('organizations')
  async createOrg(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateOrganizationSchema, body);
    return guard(async () =>
      createOrganization(this.db, await this.me(request), input, request.traceId),
    );
  }

  @Post('organizations/import')
  async importOrgs(@Req() request: Request, @Body() body: unknown) {
    const input = parse(ImportOrganizationsSchema, body);
    return guard(async () =>
      importOrganizations(this.db, await this.me(request), input, request.traceId),
    );
  }

  /** La création de comptes est-elle configurée dans Keycloak ? Sert à guider la personne. */
  @Get('accounts/status')
  async accountStatus() {
    return { configured: this.identity.configured() };
  }

  @Post('accounts')
  async createAccount(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateAccountSchema, body);
    return guard(async () =>
      createAccount(this.db, this.identity, await this.me(request), input, request.traceId),
    );
  }

  @Post('invitations')
  async invite(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateTeamInvitationSchema, body);
    return guard(async () =>
      createTeamInvitation(this.db, await this.me(request), input, request.traceId),
    );
  }

  @Post('invitations/redeem')
  async redeem(@Req() request: Request, @Body() body: unknown) {
    const { code } = parse(RedeemTeamInvitationSchema, body);
    return guard(async () =>
      redeemTeamInvitation(this.db, await this.me(request), code, request.traceId),
    );
  }

  @Patch('members/:id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const { branches } = parse(UpdateTeamMemberSchema, body);
    await guard(async () =>
      updateMemberBranches(
        this.db,
        await this.me(request),
        memberId(id),
        branches,
        request.traceId,
      ),
    );
    return { ok: true };
  }

  @Delete('members/:id')
  async remove(@Req() request: Request, @Param('id') id: string) {
    await guard(async () =>
      removeMember(this.db, await this.me(request), memberId(id), request.traceId),
    );
    return { ok: true };
  }
}
