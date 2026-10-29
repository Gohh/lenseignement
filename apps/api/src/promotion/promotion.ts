import { nextLevel, type LevelCode, type LevelPromotion } from '@lenseignement/types';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { auditLogs, cohortMembers, guardianLinks, levelRequests, users } from '../db/schema.js';

export class PromotionError extends Error {
  constructor(
    readonly kind: 'invalid' | 'not_found',
    message: string,
  ) {
    super(message);
  }
}

async function levelOf(db: Database, learnerId: string): Promise<string | null> {
  const [row] = await db.select({ level: users.level }).from(users).where(eq(users.id, learnerId));
  if (!row) throw new PromotionError('not_found', 'Apprenant introuvable.');
  return row.level;
}

async function audit(
  db: Database,
  actorUserId: string,
  action: string,
  learnerId: string,
  reason: string,
  traceId?: string,
) {
  await db.insert(auditLogs).values({
    actorUserId,
    action,
    resourceType: 'learner',
    resourceId: learnerId.slice(0, 64),
    decision: 'allow',
    reason,
    traceId,
  });
}

/** Niveau actuel, niveau suivant et demande en attente d'un apprenant. */
export async function promotionOf(
  db: Database,
  learnerId: string,
  canDecide: boolean,
): Promise<LevelPromotion> {
  const level = await levelOf(db, learnerId);
  const [pending] = await db
    .select({ id: levelRequests.id })
    .from(levelRequests)
    .where(and(eq(levelRequests.learnerUserId, learnerId), eq(levelRequests.status, 'pending')));
  return {
    level: (level as LevelCode | null) ?? null,
    nextLevel: level ? nextLevel(level) : null,
    pending: Boolean(pending),
    canDecide,
  };
}

/** Quelqu'un peut-il valider ? Un parent au lien vérifié, ou une classe suivie par le personnel. */
async function hasValidator(db: Database, learnerId: string): Promise<boolean> {
  const [guardian] = await db
    .select({ id: guardianLinks.id })
    .from(guardianLinks)
    .where(and(eq(guardianLinks.learnerUserId, learnerId), eq(guardianLinks.status, 'verified')))
    .limit(1);
  if (guardian) return true;
  const [member] = await db
    .select({ id: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.userId, learnerId), eq(cohortMembers.role, 'apprenant')))
    .limit(1);
  return Boolean(member);
}

/**
 * L'apprenant demande le niveau supérieur. Avec un parent ou un enseignant, la demande attend leur
 * validation ; un apprenant autonome passe directement.
 */
export async function requestPromotion(
  db: Database,
  learnerId: string,
  traceId?: string,
): Promise<{ status: 'pending' | 'applied'; level: LevelCode }> {
  const level = await levelOf(db, learnerId);
  const target = level ? nextLevel(level) : null;
  if (!level || !target) {
    throw new PromotionError('invalid', 'Aucun niveau supérieur à demander.');
  }
  if (await hasValidator(db, learnerId)) {
    await db
      .insert(levelRequests)
      .values({ learnerUserId: learnerId, fromLevel: level, toLevel: target })
      .onConflictDoNothing();
    await audit(db, learnerId, 'level.request', learnerId, 'self', traceId);
    return { status: 'pending', level: target };
  }
  await db.update(users).set({ level: target }).where(eq(users.id, learnerId));
  await audit(db, learnerId, 'level.promote', learnerId, 'self', traceId);
  return { status: 'applied', level: target };
}

/** Le parent ou l'enseignant accepte (ou fait passer directement) l'apprenant au niveau suivant. */
export async function approvePromotion(
  db: Database,
  learnerId: string,
  deciderId: string,
  traceId?: string,
): Promise<{ level: LevelCode }> {
  const target = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ level: users.level })
      .from(users)
      .where(eq(users.id, learnerId))
      .for('update');
    const next = current?.level ? nextLevel(current.level) : null;
    if (!next) throw new PromotionError('invalid', 'Aucun niveau supérieur.');
    await tx.update(users).set({ level: next }).where(eq(users.id, learnerId));
    await tx
      .update(levelRequests)
      .set({ status: 'approved', decidedByUserId: deciderId, decidedAt: sql`now()` })
      .where(and(eq(levelRequests.learnerUserId, learnerId), eq(levelRequests.status, 'pending')));
    return next;
  });
  await audit(db, deciderId, 'level.approve', learnerId, 'decider', traceId);
  return { level: target };
}

/** Refus de la demande en attente : le niveau ne change pas. */
export async function declinePromotion(
  db: Database,
  learnerId: string,
  deciderId: string,
  traceId?: string,
): Promise<void> {
  const declined = await db
    .update(levelRequests)
    .set({ status: 'declined', decidedByUserId: deciderId, decidedAt: sql`now()` })
    .where(and(eq(levelRequests.learnerUserId, learnerId), eq(levelRequests.status, 'pending')))
    .returning({ id: levelRequests.id });
  if (declined.length === 0) throw new PromotionError('not_found', 'Aucune demande en attente.');
  await audit(db, deciderId, 'level.decline', learnerId, 'decider', traceId);
}
