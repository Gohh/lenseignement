import { BadRequestException, Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { LevelCodeSchema } from '@lenseignement/types';
import { z } from 'zod';
import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Request } from 'express';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { guardianLinks, memberships, organizations, users } from '../db/schema.js';
import { UsersService } from '../users/users.service.js';

/** Identité et rattachements de la personne connectée. */
@Controller('me')
export class MeController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  @Get()
  async get(@Req() request: Request) {
    // Le garde d'authentification garantit la présence du principal sur les routes protégées.
    const principal = request.principal as Principal;
    const user = await this.users.resolve(principal);
    const rows = await this.db
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(
        and(
          eq(memberships.userId, user.id),
          or(isNull(memberships.validUntil), gt(memberships.validUntil, new Date())),
        ),
      )
      .orderBy(asc(organizations.name), asc(memberships.role));
    return {
      subject: principal.subject,
      roles: principal.roles,
      userId: user.id,
      displayName: user.displayName,
      level: user.level,
      memberships: rows,
    };
  }

  /** Cycle et niveau choisis par la personne pour elle-même (null = pas encore choisi). */
  @Put('level')
  async setLevel(@Req() request: Request, @Body() body: unknown) {
    const parsed = z.object({ level: LevelCodeSchema.nullable() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Niveau inconnu.');
    const user = await this.users.resolve(request.principal as Principal);
    await this.db.update(users).set({ level: parsed.data.level }).where(eq(users.id, user.id));
    return { level: parsed.data.level };
  }

  /** Enfants dont la personne est parent ou tuteur, uniquement par lien vérifié. */
  @Get('children')
  async children(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(guardianLinks)
      .innerJoin(users, eq(users.id, guardianLinks.learnerUserId))
      .where(and(eq(guardianLinks.guardianUserId, user.id), eq(guardianLinks.status, 'verified')))
      .orderBy(asc(users.displayName));
  }
}
