import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UpdateOrganizationSchema } from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  getOrganization,
  listOrganizations,
  myEstablishment,
  setOrganizationArchived,
  updateOrganization,
} from './organizations.js';
import { TeamError } from './team.js';

const QuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  direction: z.string().uuid().optional(),
  type: z.string().max(40).optional(),
  archived: z.enum(['0', '1']).optional(),
});

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

const orgId = (id: string) => {
  if (!z.string().uuid().safeParse(id).success) {
    throw new NotFoundException('Établissement introuvable.');
  }
  return id;
};

/** Configuration des établissements : liste, fiche, modification, archivage. */
@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get()
  async list(@Req() request: Request, @Query() query: unknown) {
    const parsed = QuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    const { search, direction, type, archived } = parsed.data;
    return {
      items: await guard(async () =>
        listOrganizations(this.db, await this.me(request), {
          search: search || undefined,
          directionId: direction,
          type: type || undefined,
          archived: archived === '1',
        }),
      ),
    };
  }

  /** Établissement de la personne, pour l'en-tête « L'Enseignement à … ». */
  @Get('mine')
  async mine(@Req() request: Request) {
    return { establishment: await myEstablishment(this.db, await this.me(request)) };
  }

  @Get(':id')
  async one(@Req() request: Request, @Param('id') id: string) {
    return guard(async () => getOrganization(this.db, await this.me(request), orgId(id)));
  }

  @Patch(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateOrganizationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    return guard(async () =>
      updateOrganization(this.db, await this.me(request), orgId(id), parsed.data, request.traceId),
    );
  }

  @Post(':id/archive')
  async archive(@Req() request: Request, @Param('id') id: string) {
    return guard(async () =>
      setOrganizationArchived(this.db, await this.me(request), orgId(id), true, request.traceId),
    );
  }

  @Post(':id/restore')
  async restore(@Req() request: Request, @Param('id') id: string) {
    return guard(async () =>
      setOrganizationArchived(this.db, await this.me(request), orgId(id), false, request.traceId),
    );
  }
}
