import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { Request } from 'express';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { cohortMembers, cohorts, users } from '../db/schema.js';
import { UsersService } from '../users/users.service.js';

/** Fiche d'un apprenant : lui-même, son parent vérifié ou le personnel de son périmètre. */
@Controller('learners')
export class LearnersController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const user = await this.users.resolve(request.principal as Principal);
    await this.access.assertCanRead({
      userId: user.id,
      action: 'learner.read',
      resourceType: 'learner',
      resourceId: id,
      traceId: request.traceId,
    });
    const [learner] = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, id));
    const learnerCohorts = await this.db
      .select({
        id: cohorts.id,
        code: cohorts.code,
        name: cohorts.name,
        schoolYear: cohorts.schoolYear,
      })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
      .where(and(eq(cohortMembers.userId, id), eq(cohortMembers.role, 'apprenant')))
      .orderBy(asc(cohorts.code));
    return { ...learner, cohorts: learnerCohorts };
  }
}
