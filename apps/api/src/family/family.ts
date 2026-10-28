import { randomInt, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { CreateChildInput, FamilyChild, TutoredChild } from '@lenseignement/types';
import type { Database } from '../db/database.js';
import { auditLogs, guardianLinks, tutorInvitations, tutorLinks, users } from '../db/schema.js';

export class FamilyError extends Error {
  constructor(
    readonly kind: 'invalid' | 'not_found',
    message: string,
  ) {
    super(message);
  }
}

const MAX_CHILDREN = 10;
const INVITATION_DAYS = 7;
/** Sans 0, O, 1, I ni L : le code se recopie à la main. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

async function audit(
  db: Database,
  actorUserId: string,
  action: string,
  resourceId: string,
  reason: string,
  traceId?: string,
) {
  await db.insert(auditLogs).values({
    actorUserId,
    action,
    resourceType: 'learner',
    resourceId: resourceId.slice(0, 64),
    decision: 'allow',
    reason,
    traceId,
  });
}

/** Enfants du parent, avec les répétiteurs qui y ont accès. */
export async function listChildren(db: Database, guardianId: string): Promise<FamilyChild[]> {
  const children = await db
    .select({ id: users.id, displayName: users.displayName, level: users.level })
    .from(guardianLinks)
    .innerJoin(users, eq(users.id, guardianLinks.learnerUserId))
    .where(and(eq(guardianLinks.guardianUserId, guardianId), eq(guardianLinks.status, 'verified')))
    .orderBy(asc(users.displayName));
  if (children.length === 0) return [];
  const tutors = await db
    .select({
      linkId: tutorLinks.id,
      learnerId: tutorLinks.learnerUserId,
      tutorName: users.displayName,
    })
    .from(tutorLinks)
    .innerJoin(users, eq(users.id, tutorLinks.tutorUserId))
    .where(
      and(
        eq(tutorLinks.status, 'active'),
        inArray(
          tutorLinks.learnerUserId,
          children.map((c) => c.id),
        ),
      ),
    );
  return children.map((c) => ({
    ...c,
    tutors: tutors
      .filter((t) => t.learnerId === c.id)
      .map((t) => ({ linkId: t.linkId, tutorName: t.tutorName })),
  }));
}

/** Le parent crée le profil de son enfant : pas de connexion propre, le parent garde la main. */
export async function createChild(
  db: Database,
  guardianId: string,
  input: CreateChildInput,
  traceId?: string,
): Promise<{ id: string }> {
  const id = await db.transaction(async (tx) => {
    const count = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guardianLinks)
      .where(
        and(eq(guardianLinks.guardianUserId, guardianId), eq(guardianLinks.status, 'verified')),
      );
    if ((count[0]?.n ?? 0) >= MAX_CHILDREN) {
      throw new FamilyError('invalid', `Vous pouvez ajouter ${MAX_CHILDREN} enfants au plus.`);
    }
    const childId = randomUUID();
    await tx.insert(users).values({
      id: childId,
      oidcSubject: `child:${childId}`,
      accountType: 'minor',
      displayName: input.displayName,
      level: input.level ?? null,
    });
    await tx.insert(guardianLinks).values({
      guardianUserId: guardianId,
      learnerUserId: childId,
      status: 'verified',
      verifiedAt: sql`now()`,
    });
    return childId;
  });
  await audit(db, guardianId, 'family.child.create', id, 'guardian', traceId);
  return { id };
}

/** Code d'invitation pour un répétiteur, valable 7 jours, pour des enfants du parent seulement. */
export async function createInvitation(
  db: Database,
  guardianId: string,
  learnerIds: string[],
  traceId?: string,
): Promise<{ code: string; expiresAt: string }> {
  const unique = [...new Set(learnerIds)];
  const own = await db
    .select({ id: guardianLinks.learnerUserId })
    .from(guardianLinks)
    .where(
      and(
        eq(guardianLinks.guardianUserId, guardianId),
        eq(guardianLinks.status, 'verified'),
        inArray(guardianLinks.learnerUserId, unique),
      ),
    );
  if (own.length !== unique.length) {
    throw new FamilyError('invalid', 'Un des enfants choisis n’est pas le vôtre.');
  }
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 3600 * 1000);
  const code = newCode();
  await db.insert(tutorInvitations).values({
    code,
    guardianUserId: guardianId,
    learnerUserIds: unique,
    expiresAt,
  });
  await audit(db, guardianId, 'family.invitation.create', unique.join(','), 'guardian', traceId);
  return { code, expiresAt: expiresAt.toISOString() };
}

/** Le répétiteur saisit le code : accès en lecture seule aux enfants confiés. */
export async function redeemInvitation(
  db: Database,
  tutorId: string,
  rawCode: string,
  traceId?: string,
): Promise<{ children: number }> {
  const code = rawCode.replace(/[\s-]/g, '').toUpperCase();
  const linked = await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(tutorInvitations)
      .where(
        and(
          eq(tutorInvitations.code, code),
          isNull(tutorInvitations.usedAt),
          gt(tutorInvitations.expiresAt, new Date()),
        ),
      )
      .for('update');
    // Message unique : on ne révèle pas si le code a existé.
    if (!invitation || invitation.guardianUserId === tutorId) {
      throw new FamilyError('not_found', 'Code invalide ou expiré.');
    }
    // Seuls les enfants encore liés au parent sont confiés (le lien a pu être retiré entre-temps).
    const stillOwn = await tx
      .select({ id: guardianLinks.learnerUserId })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.guardianUserId, invitation.guardianUserId),
          eq(guardianLinks.status, 'verified'),
          inArray(guardianLinks.learnerUserId, invitation.learnerUserIds),
        ),
      );
    for (const { id } of stillOwn) {
      if (id === tutorId) continue;
      await tx
        .insert(tutorLinks)
        .values({
          tutorUserId: tutorId,
          learnerUserId: id,
          grantedByUserId: invitation.guardianUserId,
        })
        .onConflictDoUpdate({
          target: [tutorLinks.tutorUserId, tutorLinks.learnerUserId],
          set: { status: 'active', revokedAt: null, grantedByUserId: invitation.guardianUserId },
        });
    }
    await tx
      .update(tutorInvitations)
      .set({ usedByUserId: tutorId, usedAt: sql`now()` })
      .where(eq(tutorInvitations.id, invitation.id));
    return stillOwn.map((r) => r.id);
  });
  await audit(db, tutorId, 'family.invitation.redeem', linked.join(','), 'tutor', traceId);
  return { children: linked.length };
}

/** Le parent retire l'accès d'un répétiteur à l'un de ses enfants. */
export async function revokeTutor(
  db: Database,
  guardianId: string,
  linkId: string,
  traceId?: string,
): Promise<void> {
  const [link] = await db
    .select({ id: tutorLinks.id, learnerId: tutorLinks.learnerUserId })
    .from(tutorLinks)
    .innerJoin(
      guardianLinks,
      and(
        eq(guardianLinks.learnerUserId, tutorLinks.learnerUserId),
        eq(guardianLinks.guardianUserId, guardianId),
        eq(guardianLinks.status, 'verified'),
      ),
    )
    .where(and(eq(tutorLinks.id, linkId), eq(tutorLinks.status, 'active')));
  if (!link) throw new FamilyError('not_found', 'Accès introuvable.');
  await db
    .update(tutorLinks)
    .set({ status: 'revoked', revokedAt: sql`now()` })
    .where(eq(tutorLinks.id, link.id));
  await audit(db, guardianId, 'family.tutor.revoke', link.learnerId, 'guardian', traceId);
}

/** Enfants confiés au répétiteur. */
export async function listTutored(db: Database, tutorId: string): Promise<TutoredChild[]> {
  return db
    .select({ id: users.id, displayName: users.displayName, level: users.level })
    .from(tutorLinks)
    .innerJoin(users, eq(users.id, tutorLinks.learnerUserId))
    .where(and(eq(tutorLinks.tutorUserId, tutorId), eq(tutorLinks.status, 'active')))
    .orderBy(asc(users.displayName));
}
