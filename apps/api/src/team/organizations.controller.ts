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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  CreateEstablishmentSchema,
  EstablishmentChangeSchema,
  ImportEstablishmentsSchema,
  UpdateEstablishmentSchema,
  UpdateOrganizationSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  addEstablishmentChange,
  createEstablishment,
  importEstablishments,
  updateEstablishment,
} from './establishments.js';
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
  /** Onglet : les établissements, ou les directions régionales. */
  kind: z.enum(['etablissements', 'directions']).optional(),
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

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
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
    const { search, direction, type, archived, kind } = parsed.data;
    return {
      items: await guard(async () =>
        listOrganizations(this.db, await this.me(request), {
          search: search || undefined,
          directionId: direction,
          type: type || undefined,
          archived: archived === '1',
          kind,
        }),
      ),
    };
  }

  /** Création d'un établissement d'une des six catégories, par formulaire. */
  @Post('establishments')
  async createEstablishment(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateEstablishmentSchema, body);
    return guard(async () =>
      createEstablishment(this.db, await this.me(request), input, request.traceId),
    );
  }

  /** Import contrôlé d'une catégorie : aperçu des anomalies, puis confirmation. */
  @Post('establishments/import')
  async importEstablishments(@Req() request: Request, @Body() body: unknown) {
    const input = parse(ImportEstablishmentsSchema, body);
    return guard(async () =>
      importEstablishments(this.db, await this.me(request), input, request.traceId),
    );
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

  /** « Modifier » : corriger la fiche d'un établissement. */
  @Put(':id/fiche')
  async fiche(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(UpdateEstablishmentSchema, body);
    return guard(async () =>
      updateEstablishment(this.db, await this.me(request), orgId(id), input, request.traceId),
    );
  }

  /** « Mettre à jour » : enregistrer un changement daté. */
  @Post(':id/changes')
  async change(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(EstablishmentChangeSchema, body);
    return guard(async () =>
      addEstablishmentChange(this.db, await this.me(request), orgId(id), input, request.traceId),
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
