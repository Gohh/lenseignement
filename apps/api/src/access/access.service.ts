import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { auditLogs } from '../db/schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Message unique : on ne révèle jamais si la ressource existe (cahier §8.2.3). */
export const ACCESS_DENIED = 'Accès refusé.';

export type AccessReason = 'self' | 'guardian' | 'tutor' | 'scope' | 'out_of_scope' | 'invalid_id';

export interface AccessRequest {
  userId: string;
  action: string;
  resourceType: 'cohort' | 'learner';
  resourceId: string;
  traceId?: string;
}

export interface AuthoringRequest {
  userId: string;
  action: string;
  resourceType: 'organization' | 'course' | 'course_version';
  resourceId: string;
  /** Établissement responsable de la ressource ; null si elle n'existe pas. */
  organizationId: string | null;
  /** Cycle (espace) de la ressource, quand elle en a un : le rôle doit y être accordé (ADR-019). */
  branch?: string | null;
  traceId?: string;
}

/** Rôles qui peuvent rédiger des cours pour leur structure (ADR-005). */
export const AUTHOR_ROLES = [
  'enseignant',
  'alphabetiseur',
  'referent-pedagogique',
  'chef-etablissement',
  'gestionnaire',
] as const;

/** Circuit de validation (ADR-006) : qui approuve, et qui publie ou retire. */
export const REVIEWER_ROLES = ['referent-pedagogique'] as const;
export const PUBLISHER_ROLES = ['referent-pedagogique', 'chef-etablissement'] as const;

/** Équipe d'une structure (ADR-021) : qui invite, change les cycles et retire les rôles. */
export const TEAM_ROLES = ['chef-etablissement', 'administrateur', 'superadministrateur'] as const;

/**
 * Structures dont la personne gère l'équipe : celles qu'elle dirige ou administre (sous-structures
 * comprises) ; le superadministrateur les gère toutes. Renvoie une sous-requête entre parenthèses.
 */
export function teamOrganizationIds(userId: string): SQL {
  return sql`(
    select o.id from organizations o
     where exists (
       select 1 from memberships m
        where m.user_id = ${userId}
          and m.role = 'superadministrateur'
          and (m.valid_until is null or m.valid_until > now()))
    union
    select t.id from ${organizationIdsWithRoles(userId, ['chef-etablissement', 'administrateur'])} t)`;
}

/** Tableau de chiffres anonymes (ADR-016) : direction d'établissement et référents. */
export const STATS_ROLES = ['chef-etablissement', 'referent-pedagogique'] as const;

/**
 * Structures où une personne a l'un des rôles donnés, sous-structures comprises (un référent
 * régional couvre les écoles de sa région). Renvoie une sous-requête entre parenthèses.
 * Avec `branch` (un code ou une expression SQL), seuls comptent les rôles accordés pour ce cycle.
 */
export function organizationIdsWithRoles(
  userId: string,
  roles: readonly string[],
  branch?: string | SQL,
): SQL {
  const cycle =
    branch === undefined ? sql`` : sql` and (m.branches is null or ${branch} = any(m.branches))`;
  return sql`(
    with recursive role_orgs as (
      select m.organization_id as id
        from memberships m
       where m.user_id = ${userId}
         and m.role in (${sql.join(
           roles.map((role) => sql`${role}`),
           sql`, `,
         )})
         and (m.valid_until is null or m.valid_until > now())${cycle}
      union
      select o.id from organizations o join role_orgs r on o.parent_id = r.id
    )
    select id from role_orgs)`;
}

/** Structures où une personne peut rédiger (pour un cycle donné, si `branch` est fourni). */
export function authoringOrganizationIds(userId: string, branch?: string | SQL): SQL {
  return organizationIdsWithRoles(userId, AUTHOR_ROLES, branch);
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
    await this.audit({ ...request, reason });
    if (reason === 'out_of_scope' || reason === 'invalid_id') {
      throw new ForbiddenException(ACCESS_DENIED);
    }
  }

  /**
   * Décision pédagogique sur un apprenant (corriger son orientation de rattrapage) : réservée au
   * personnel de son périmètre ; ni l'apprenant lui-même ni son parent. Refus uniforme et journalisé.
   */
  async assertCanGuide(request: AccessRequest): Promise<void> {
    const decided = await this.decide(request);
    const reason: AccessReason =
      decided === 'scope' || decided === 'invalid_id' ? decided : 'out_of_scope';
    await this.audit({ ...request, reason });
    if (reason !== 'scope') throw new ForbiddenException(ACCESS_DENIED);
  }

  /** Vrai si la personne fait partie du personnel du périmètre de l'apprenant (sans journal). */
  async isInScope(request: AccessRequest): Promise<boolean> {
    return (await this.decide(request)) === 'scope';
  }

  /** Rédaction de cours : réservée aux structures de la personne. Refus uniforme et journalisé. */
  async assertCanAuthor(request: AuthoringRequest): Promise<void> {
    await this.assertHasRole(request, AUTHOR_ROLES);
  }

  /** La personne a l'un des rôles donnés dans la structure de la ressource. Refus journalisé. */
  async assertHasRole(request: AuthoringRequest, roles: readonly string[]): Promise<void> {
    let reason: AccessReason = 'out_of_scope';
    if (!UUID.test(request.resourceId)) {
      reason = 'invalid_id';
    } else if (request.organizationId) {
      const { rows } = await this.db.execute(
        sql`select 1 from ${organizationIdsWithRoles(request.userId, roles, request.branch ?? undefined)} a where a.id = ${request.organizationId}`,
      );
      if (rows.length > 0) reason = 'scope';
    }
    await this.audit({ ...request, reason });
    if (reason !== 'scope') throw new ForbiddenException(ACCESS_DENIED);
  }

  /**
   * La personne a l'un des rôles donnés dans au moins une structure (tableau de chiffres :
   * le périmètre est ensuite celui de ces structures). Refus uniforme et journalisé.
   */
  async assertHasAnyRole(
    request: { userId: string; action: string; traceId?: string },
    roles: readonly string[],
  ): Promise<void> {
    const { rows } = await this.db.execute(
      sql`select 1 from ${organizationIdsWithRoles(request.userId, roles)} a limit 1`,
    );
    const reason: AccessReason = rows.length > 0 ? 'scope' : 'out_of_scope';
    await this.audit({ ...request, resourceType: 'organization', resourceId: 'stats', reason });
    if (reason !== 'scope') throw new ForbiddenException(ACCESS_DENIED);
  }

  private async audit(entry: {
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    reason: AccessReason;
    traceId?: string;
  }): Promise<void> {
    const allowed = entry.reason !== 'out_of_scope' && entry.reason !== 'invalid_id';
    await this.db.insert(auditLogs).values({
      actorUserId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId.slice(0, 64),
      decision: allowed ? 'allow' : 'deny',
      reason: entry.reason,
      traceId: entry.traceId,
    });
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
      select 'tutor'
        from tutor_links t
       where t.tutor_user_id = ${userId}
         and t.learner_user_id = ${resourceId}
         and t.status = 'active'
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
