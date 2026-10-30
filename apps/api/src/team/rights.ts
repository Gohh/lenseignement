import {
  RIGHT_DEFINITIONS,
  type RightCode,
  type RightsOverview,
  type WithdrawnRight,
} from '@lenseignement/types';
import { sql } from 'drizzle-orm';
import type { Database, Executor } from '../db/database.js';
import { auditLogs, withdrawnRights as withdrawnRightsTable } from '../db/schema.js';

/** Droits retirés par le superadministrateur, profil par profil. */
export async function withdrawnRights(db: Executor): Promise<WithdrawnRight[]> {
  const { rows } = await db.execute<WithdrawnRight>(
    sql`select role as profile, "right" from withdrawn_rights order by role, "right"`,
  );
  return rows;
}

/**
 * Droits d'une personne d'après ses rôles actifs : un droit est acquis si l'un de ses rôles l'a
 * par défaut et qu'il ne lui a pas été retiré. Le superadministrateur a tout, sauf publier les
 * programmes (réservé au référent pédagogique).
 */
export async function rightsForRoles(db: Executor, roles: Set<string>): Promise<Set<RightCode>> {
  const withdrawn = new Set((await withdrawnRights(db)).map((w) => `${w.profile} ${w.right}`));
  const rights = new Set(
    RIGHT_DEFINITIONS.filter((d) =>
      d.profiles.some((p) => roles.has(p) && !withdrawn.has(`${p} ${d.code}`)),
    ).map((d) => d.code),
  );
  if (roles.has('superadministrateur')) {
    for (const d of RIGHT_DEFINITIONS) if (d.code !== 'programmes-publier') rights.add(d.code);
  }
  return rights;
}

/** Remplace la liste des droits retirés ; chaque changement va au journal. Superadministrateur seul. */
export async function setWithdrawnRights(
  db: Database,
  userId: string,
  next: WithdrawnRight[],
  traceId?: string,
): Promise<RightsOverview> {
  const valid = next.filter((w) =>
    RIGHT_DEFINITIONS.some((d) => d.code === w.right && d.profiles.includes(w.profile)),
  );
  const key = (w: WithdrawnRight) => `${w.profile} ${w.right}`;
  await db.transaction(async (tx) => {
    const before = new Set((await withdrawnRights(tx)).map(key));
    const after = new Set(valid.map(key));
    const changes = [
      ...[...after].filter((k) => !before.has(k)).map((k) => ['rights.withdraw', k] as const),
      ...[...before].filter((k) => !after.has(k)).map((k) => ['rights.grant', k] as const),
    ];
    await tx.delete(withdrawnRightsTable);
    if (valid.length > 0) {
      await tx
        .insert(withdrawnRightsTable)
        .values(valid.map((w) => ({ role: w.profile, right: w.right, withdrawnBy: userId })));
    }
    if (changes.length > 0) {
      await tx.insert(auditLogs).values(
        changes.map(([action, k]) => ({
          actorUserId: userId,
          action,
          resourceType: 'rights',
          resourceId: k.slice(0, 64),
          decision: 'allow' as const,
          reason: 'droits',
          traceId,
        })),
      );
    }
  });
  return { withdrawn: await withdrawnRights(db) };
}
