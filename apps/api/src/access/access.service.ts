import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { auditLogs } from '../db/schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Message unique : on ne révèle jamais si la ressource existe (cahier §8.2.3). */
export const ACCESS_DENIED = 'Accès refusé.';

export type AccessReason = 'self' | 'guardian' | 'scope' | 'out_of_scope' | 'invalid_id';

export interface AccessRequest {
  userId: string;
  action: string;
  resourceType: 'cohort' | 'learner';
  resourceId: string;
  traceId?: string;
}

/**
 * Classes visibles par une personne :
 * - celles où elle enseigne, tant que son rattachement « enseignant » à la structure est valide ;
 * - toutes celles d'une structure qu'elle dirige ou suit comme référent, sous-structures comprises.
 * Renvoie une sous-requête entre parenthèses, utilisable dans `in (...)`.
 */
export function visibleCohortIds(userId: string): SQL {
  return sql`(
    with recursive scope_orgs as (
      select m.organization_id as id
        from memberships m
       where m.user_id = ${userId}
         and m.role in ('chef-etablissement', 'referent-pedagogique')
         and (m.valid_until is null or m.valid_until > now())
      union
      select o.id from organizations o join scope_orgs s on o.parent_id = s.id
    )
    select c.id from cohorts c where c.organization_id in (select id from scope_orgs)
    union
    select cm.cohort_id
      from cohort_members cm
      join cohorts c on c.id = cm.cohort_id
      join memberships m
        on m.user_id = cm.user_id
       and m.organization_id = c.organization_id
       and m.role = 'enseignant'
       and (m.valid_until is null or m.valid_until > now())
     where cm.user_id = ${userId} and cm.role = 'enseignant')`;
}

/**
 * Contrôle d'accès par attributs (ABAC) aux données d'apprenants. Refus par défaut ;
 * chaque décision, accordée ou refusée, est inscrite au journal d'audit.
 */
@Injectable()
export class AccessService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Lève une 403 uniforme si l'accès n'est pas accordé. */
  async assertCanRead(request: AccessRequest): Promise<void> {
    const reason = await this.decide(request);
    const allowed = reason !== 'out_of_scope' && reason !== 'invalid_id';
    await this.db.insert(auditLogs).values({
      actorUserId: request.userId,
      action: request.action,
      resourceType: request.resourceType,
      resourceId: request.resourceId.slice(0, 64),
      decision: allowed ? 'allow' : 'deny',
      reason,
      traceId: request.traceId,
    });
    if (!allowed) throw new ForbiddenException(ACCESS_DENIED);
  }

  private async decide({ userId, resourceType, resourceId }: AccessRequest): Promise<AccessReason> {
    if (!UUID.test(resourceId)) return 'invalid_id';
    if (resourceType === 'cohort') {
      const { rows } = await this.db.execute(
        sql`select 1 from ${visibleCohortIds(userId)} v where v.id = ${resourceId}`,
      );
      return rows.length > 0 ? 'scope' : 'out_of_scope';
    }
    if (resourceId === userId) return 'self';
    const { rows } = await this.db.execute<{ reason: AccessReason }>(sql`
      select 'guardian' as reason
        from guardian_links g
       where g.guardian_user_id = ${userId}
         and g.learner_user_id = ${resourceId}
         and g.status = 'verified'
      union all
      select 'scope'
        from cohort_members cm
       where cm.user_id = ${resourceId}
         and cm.role = 'apprenant'
         and cm.cohort_id in ${visibleCohortIds(userId)}
      limit 1`);
    return rows[0]?.reason ?? 'out_of_scope';
  }
}
