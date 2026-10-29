import { randomInt } from 'node:crypto';
import {
  learnerUsername,
  levelLabel,
  levelsForOrganizationType,
  type AddLearnersResult,
  type CohortAdminItem,
  type NewLearner,
  type CohortRosterTools,
  type OrganizationCohorts,
} from '@lenseignement/types';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { cohortMembers, cohorts, memberships, organizations, users } from '../db/schema.js';
import { IdentityError, temporaryPassword, type IdentityAdmin } from '../team/identity-admin.js';
import { assertManages, audit, TeamError } from '../team/team.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** Identifiant court tiré du nom, unique par établissement et année : « CE2 A » devient « ce2-a ». */
function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'classe'
  );
}

async function loadOrganization(db: Database, organizationId: string) {
  const [org] = await db
    .select({
      id: organizations.id,
      type: organizations.type,
      archivedAt: organizations.archivedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) throw new TeamError('not_found', 'Établissement introuvable.');
  return org;
}

async function managedCohort(db: Database, userId: string, cohortId: string) {
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId));
  if (!cohort) throw new TeamError('not_found', 'Classe introuvable.');
  await assertManages(db, userId, cohort.organizationId).catch(() => {
    throw new TeamError('not_found', 'Classe introuvable.');
  });
  return cohort;
}

/** Les enseignants de l'équipe d'un établissement (rôle actif), affectables à ses classes. */
async function teacherCandidates(db: Database, organizationId: string) {
  const rows = await db
    .selectDistinct({ userId: users.id, name: users.displayName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.role, 'enseignant'),
        or(isNull(memberships.validUntil), sql`${memberships.validUntil} > now()`),
      ),
    );
  return rows
    .map((r) => ({ userId: r.userId, name: r.name ?? 'Sans nom' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function organizationCohorts(
  db: Database,
  userId: string,
  organizationId: string,
): Promise<OrganizationCohorts> {
  await assertManages(db, userId, organizationId).catch(() => {
    throw new TeamError('not_found', 'Établissement introuvable.');
  });
  const org = await loadOrganization(db, organizationId);
  const rows = await db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      level: cohorts.level,
      schoolYear: cohorts.schoolYear,
      archivedAt: cohorts.archivedAt,
      joinCode: cohorts.joinCode,
      learnerCount: sql<number>`(select count(*)::int from cohort_members cm
        where cm.cohort_id = ${cohorts.id} and cm.role = 'apprenant')`,
    })
    .from(cohorts)
    .where(eq(cohorts.organizationId, organizationId))
    .orderBy(sql`${cohorts.archivedAt} is not null`, sql`${cohorts.schoolYear} desc`, cohorts.name);
  const teachers = await db
    .select({ cohortId: cohortMembers.cohortId, userId: users.id, name: users.displayName })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
    .where(and(eq(cohorts.organizationId, organizationId), eq(cohortMembers.role, 'enseignant')));
  const items: CohortAdminItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    level: r.level,
    levelLabel: r.level ? levelLabel(r.level) : null,
    schoolYear: r.schoolYear,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    joinCode: r.joinCode,
    learnerCount: r.learnerCount,
    teachers: teachers
      .filter((t) => t.cohortId === r.id)
      .map((t) => ({ userId: t.userId, name: t.name ?? 'Sans nom' })),
  }));
  return {
    items,
    teacherCandidates: await teacherCandidates(db, organizationId),
    levels: levelsForOrganizationType(org.type),
  };
}

export async function createCohort(
  db: Database,
  userId: string,
  input: { organizationId: string; level: string; name: string; schoolYear: string },
  traceId?: string,
): Promise<{ id: string }> {
  await assertManages(db, userId, input.organizationId);
  const org = await loadOrganization(db, input.organizationId);
  if (org.archivedAt) throw new TeamError('invalid', 'Cet établissement est archivé.');
  const allowed = levelsForOrganizationType(org.type).map((l) => l.code as string);
  if (!allowed.includes(input.level)) {
    throw new TeamError('invalid', 'Ce niveau ne correspond pas à ce type d’établissement.');
  }
  const [clash] = await db
    .select({ id: cohorts.id })
    .from(cohorts)
    .where(
      and(
        eq(cohorts.organizationId, input.organizationId),
        eq(cohorts.schoolYear, input.schoolYear),
        eq(cohorts.code, slug(input.name)),
      ),
    );
  if (clash) throw new TeamError('invalid', 'Une classe de ce nom existe déjà cette année.');
  const [row] = await db
    .insert(cohorts)
    .values({
      organizationId: input.organizationId,
      code: slug(input.name),
      name: input.name,
      schoolYear: input.schoolYear,
      level: input.level,
      joinCode: newCode(),
    })
    .returning({ id: cohorts.id });
  await audit(db, userId, 'cohort.create', row!.id, traceId);
  return { id: row!.id };
}

export async function addCohortTeacher(
  db: Database,
  userId: string,
  cohortId: string,
  teacherId: string,
  traceId?: string,
): Promise<void> {
  const cohort = await managedCohort(db, userId, cohortId);
  const candidates = await teacherCandidates(db, cohort.organizationId);
  if (!candidates.some((c) => c.userId === teacherId)) {
    throw new TeamError('invalid', 'Cette personne n’est pas enseignante de cet établissement.');
  }
  await db
    .insert(cohortMembers)
    .values({ cohortId, userId: teacherId, role: 'enseignant' })
    .onConflictDoNothing();
  await audit(db, userId, 'cohort.teacher.add', cohortId, traceId);
}

export async function removeCohortTeacher(
  db: Database,
  userId: string,
  cohortId: string,
  teacherId: string,
  traceId?: string,
): Promise<void> {
  await managedCohort(db, userId, cohortId);
  await db
    .delete(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        eq(cohortMembers.userId, teacherId),
        eq(cohortMembers.role, 'enseignant'),
      ),
    );
  await audit(db, userId, 'cohort.teacher.remove', cohortId, traceId);
}

/** Nouveau code de classe : l'ancien ne marche plus (utile s'il a circulé trop largement). */
export async function renewJoinCode(
  db: Database,
  userId: string,
  cohortId: string,
  traceId?: string,
): Promise<{ joinCode: string }> {
  await managedCohort(db, userId, cohortId);
  const joinCode = newCode();
  await db.update(cohorts).set({ joinCode }).where(eq(cohorts.id, cohortId));
  await audit(db, userId, 'cohort.code.renew', cohortId, traceId);
  return { joinCode };
}

export async function setCohortArchived(
  db: Database,
  userId: string,
  cohortId: string,
  archived: boolean,
  traceId?: string,
): Promise<void> {
  await managedCohort(db, userId, cohortId);
  await db
    .update(cohorts)
    .set({ archivedAt: archived ? sql`now()` : null })
    .where(eq(cohorts.id, cohortId));
  await audit(db, userId, archived ? 'cohort.archive' : 'cohort.restore', cohortId, traceId);
}

/** L'élève saisit le code de classe : il entre dans la classe et dans son établissement. */
export async function joinCohort(
  db: Database,
  userId: string,
  rawCode: string,
  traceId?: string,
): Promise<{ cohort: string; organization: string }> {
  const code = rawCode.replace(/[\s-]/g, '').toUpperCase();
  const [row] = await db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      level: cohorts.level,
      organizationId: cohorts.organizationId,
      organization: organizations.name,
      archivedAt: cohorts.archivedAt,
      orgArchivedAt: organizations.archivedAt,
    })
    .from(cohorts)
    .innerJoin(organizations, eq(organizations.id, cohorts.organizationId))
    .where(eq(cohorts.joinCode, code));
  if (!row || row.archivedAt || row.orgArchivedAt) {
    throw new TeamError('not_found', 'Code de classe invalide.');
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(cohortMembers)
      .values({ cohortId: row.id, userId, role: 'apprenant' })
      .onConflictDoNothing();
    await tx
      .insert(memberships)
      .values({ userId, organizationId: row.organizationId, role: 'apprenant' })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.organizationId, memberships.role],
        set: { validUntil: null },
      });
    // Le menu de l'apprenant suit son profil ; le niveau de la classe devient le sien s'il n'en a pas.
    await tx
      .update(users)
      .set({
        profiles: sql`case when 'apprenant' = any(${users.profiles}) then ${users.profiles}
          else array_append(${users.profiles}, 'apprenant') end`,
        level: sql`coalesce(${users.level}, ${row.level})`,
      })
      .where(eq(users.id, userId));
  });
  await audit(db, userId, 'cohort.join', row.id, traceId);
  return { cohort: row.name, organization: row.organization };
}

/** Outils d'élèves d'une classe pour la direction : les classes de destination possibles. */
export async function rosterTools(
  db: Database,
  userId: string,
  cohortId: string,
): Promise<Omit<CohortRosterTools, 'canCreateAccounts'>> {
  const cohort = await managedCohort(db, userId, cohortId);
  const rows = await db
    .select()
    .from(cohorts)
    .where(
      and(
        eq(cohorts.organizationId, cohort.organizationId),
        isNull(cohorts.archivedAt),
        sql`${cohorts.id} <> ${cohortId}`,
      ),
    )
    .orderBy(cohorts.schoolYear, cohorts.name);
  return {
    targets: rows.map((c) => ({
      id: c.id,
      name: c.name,
      schoolYear: c.schoolYear,
      levelLabel: c.level ? levelLabel(c.level) : null,
    })),
  };
}

export async function removeLearner(
  db: Database,
  userId: string,
  cohortId: string,
  learnerId: string,
  traceId?: string,
): Promise<void> {
  await managedCohort(db, userId, cohortId);
  const removed = await db
    .delete(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        eq(cohortMembers.userId, learnerId),
        eq(cohortMembers.role, 'apprenant'),
      ),
    )
    .returning({ userId: cohortMembers.userId });
  if (removed.length === 0)
    throw new TeamError('not_found', 'Élève introuvable dans cette classe.');
  await audit(db, userId, 'cohort.learner.remove', cohortId, traceId);
}

/** Passage de classe : les élèves choisis (ou tous) quittent cette classe pour l'autre, du même établissement. */
export async function transferLearners(
  db: Database,
  userId: string,
  cohortId: string,
  input: { toCohortId: string; learnerIds?: string[] },
  traceId?: string,
): Promise<{ moved: number }> {
  const from = await managedCohort(db, userId, cohortId);
  const to = await managedCohort(db, userId, input.toCohortId).catch(() => {
    throw new TeamError('not_found', 'Classe de destination introuvable.');
  });
  if (to.id === from.id) throw new TeamError('invalid', 'Choisissez une autre classe.');
  if (to.organizationId !== from.organizationId) {
    throw new TeamError('invalid', 'Les deux classes doivent être du même établissement.');
  }
  if (to.archivedAt) throw new TeamError('invalid', 'La classe de destination est archivée.');
  return db.transaction(async (tx) => {
    const members = await tx
      .select({ userId: cohortMembers.userId })
      .from(cohortMembers)
      .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.role, 'apprenant')));
    const present = new Set(members.map((m) => m.userId));
    const chosen = input.learnerIds ?? [...present];
    if (chosen.some((id) => !present.has(id))) {
      throw new TeamError('invalid', 'Un élève choisi n’est pas dans cette classe.');
    }
    for (const learnerId of chosen) {
      await tx
        .insert(cohortMembers)
        .values({ cohortId: to.id, userId: learnerId, role: 'apprenant' })
        .onConflictDoNothing();
      await tx
        .delete(cohortMembers)
        .where(
          and(
            eq(cohortMembers.cohortId, cohortId),
            eq(cohortMembers.userId, learnerId),
            eq(cohortMembers.role, 'apprenant'),
          ),
        );
      // Le niveau de l'élève suit celui de sa nouvelle classe.
      if (to.level) await tx.update(users).set({ level: to.level }).where(eq(users.id, learnerId));
    }
    await audit(db, userId, 'cohort.learners.transfer', cohortId, traceId);
    return { moved: chosen.length };
  });
}

/**
 * La direction inscrit des élèves qui n'ont pas d'e-mail : un compte par élève, avec un
 * identifiant « prenom.nom » et un mot de passe provisoire à leur remettre sur papier.
 */
export async function addLearners(
  db: Database,
  identity: IdentityAdmin,
  userId: string,
  cohortId: string,
  learners: NewLearner[],
  traceId?: string,
): Promise<AddLearnersResult> {
  const cohort = await managedCohort(db, userId, cohortId);
  if (cohort.archivedAt) throw new TeamError('invalid', 'Cette classe est archivée.');
  if (!identity.configured()) {
    throw new TeamError(
      'invalid',
      'La création de comptes n’est pas encore configurée dans Keycloak.',
    );
  }
  const result: AddLearnersResult = { created: [], failed: [] };
  for (const learner of learners) {
    const displayName = `${learner.firstName} ${learner.lastName}`;
    const base = learnerUsername(learner);
    const password = temporaryPassword();
    let account: { id: string; username: string } | undefined;
    let reason = 'Le compte n’a pas pu être créé.';
    // Homonymes : « awa.kone », puis « awa.kone27 »…
    for (let attempt = 0; attempt < 6 && !account; attempt++) {
      const username = attempt === 0 ? base : `${base}${randomInt(10, 100)}`;
      try {
        const created = await identity.createUser({
          username,
          firstName: learner.firstName,
          lastName: learner.lastName,
          temporaryPassword: password,
        });
        account = { id: created.id, username };
      } catch (error) {
        if (!(error instanceof IdentityError)) throw error;
        reason = error.message;
        if (error.kind !== 'exists') break;
      }
    }
    if (!account) {
      result.failed.push({ displayName, reason });
      continue;
    }
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          oidcSubject: account.id,
          displayName,
          profiles: ['apprenant'],
          level: cohort.level,
        })
        .returning({ id: users.id });
      await tx
        .insert(cohortMembers)
        .values({ cohortId, userId: user!.id, role: 'apprenant' })
        .onConflictDoNothing();
      await tx
        .insert(memberships)
        .values({ userId: user!.id, organizationId: cohort.organizationId, role: 'apprenant' })
        .onConflictDoNothing();
    });
    result.created.push({ displayName, username: account.username, temporaryPassword: password });
  }
  await audit(db, userId, 'cohort.learners.add', cohortId, traceId);
  return result;
}
