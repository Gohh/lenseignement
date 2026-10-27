import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { AccessService, visibleCohortIds } from '../access/access.service.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { cohortMembers, cohorts, organizations, users } from '../db/schema.js';
import { UsersService } from '../users/users.service.js';

/** Classes accessibles selon le périmètre de la personne connectée. */
@Controller('cohorts')
export class CohortsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return this.db
      .select({
        id: cohorts.id,
        code: cohorts.code,
        name: cohorts.name,
        schoolYear: cohorts.schoolYear,
        organization: { id: organizations.id, name: organizations.name },
        learnerCount: sql<number>`(
          select count(*)::int from cohort_members cm
           where cm.cohort_id = ${cohorts.id} and cm.role = 'apprenant')`,
      })
      .from(cohorts)
      .innerJoin(organizations, eq(organizations.id, cohorts.organizationId))
      .where(inArray(cohorts.id, visibleCohortIds(user.id)))
      .orderBy(asc(organizations.name), asc(cohorts.code));
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const user = await this.users.resolve(request.principal as Principal);
    await this.access.assertCanRead({
      userId: user.id,
      action: 'cohort.read',
      resourceType: 'cohort',
      resourceId: id,
      traceId: request.traceId,
    });
    const [cohort] = await this.db
      .select({
        id: cohorts.id,
        code: cohorts.code,
        name: cohorts.name,
        schoolYear: cohorts.schoolYear,
        organization: { id: organizations.id, name: organizations.name },
      })
      .from(cohorts)
      .innerJoin(organizations, eq(organizations.id, cohorts.organizationId))
      .where(eq(cohorts.id, id));
    const learners = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(cohortMembers)
      .innerJoin(users, eq(users.id, cohortMembers.userId))
      .where(and(eq(cohortMembers.cohortId, id), eq(cohortMembers.role, 'apprenant')))
      .orderBy(asc(users.displayName));
    return { ...cohort, learners };
  }
}
