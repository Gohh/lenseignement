import { and, eq, sql } from 'drizzle-orm';
import { seedDemoCourses } from '../courses/demo-courses.js';
import { seedDemoCurricula } from '../curricula/demo-curricula.js';
import { seedDemoDiagnostic } from '../remediation/demo-diagnostic.js';
import { seedDemoSimulation } from '../simulation/demo-simulation.js';
import { seedDemoActivity } from '../stats/demo-activity.js';
import type { Database } from './database.js';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB, SCHOOL_YEAR } from './demo-data.js';
import {
  cohortMembers,
  cohorts,
  guardianLinks,
  memberships,
  organizations,
  users,
} from './schema.js';

/**
 * Jeu de départ pour le développement : une structure, une direction régionale et les sept comptes
 * de connexion (mêmes identifiants que le jeu de démonstration), sans élève, classe, cours,
 * programme ni activité. Idempotent.
 */
export async function seedBase(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values([
        { id: ID.orgRegion, name: 'Direction régionale', type: 'authority' },
        {
          id: ID.orgManguiers,
          name: 'École Les Manguiers',
          type: 'primary',
          parentId: ID.orgRegion,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(users)
      .values([
        { id: ID.userAwa, oidcSubject: SUB.awa, accountType: 'minor', displayName: 'Awa' },
        { id: ID.userKoffi, oidcSubject: SUB.koffi, accountType: 'staff', displayName: 'M. Koffi' },
        {
          id: ID.userMariam,
          oidcSubject: SUB.mariam,
          accountType: 'staff',
          displayName: 'Mme Mariam',
        },
        { id: ID.userYao, oidcSubject: SUB.yao, accountType: 'staff', displayName: 'Yao' },
        {
          id: ID.userAminata,
          oidcSubject: SUB.aminata,
          accountType: 'staff',
          displayName: 'Mme Aminata',
        },
        { id: ID.userFatou, oidcSubject: SUB.fatou, accountType: 'adult', displayName: 'Fatou' },
        { id: ID.userBamba, oidcSubject: SUB.bamba, accountType: 'staff', displayName: 'M. Bamba' },
      ])
      .onConflictDoNothing();

    await tx
      .insert(memberships)
      .values([
        { userId: ID.userBamba, organizationId: ID.orgManguiers, role: 'chef-etablissement' },
        { userId: ID.userKoffi, organizationId: ID.orgManguiers, role: 'enseignant' },
        { userId: ID.userAminata, organizationId: ID.orgManguiers, role: 'enseignant' },
        { userId: ID.userMariam, organizationId: ID.orgRegion, role: 'referent-pedagogique' },
        { userId: ID.userAwa, organizationId: ID.orgManguiers, role: 'apprenant' },
      ])
      .onConflictDoNothing();

    await tx
      .update(memberships)
      .set({ branches: ['primaire'] })
      .where(
        and(
          eq(memberships.userId, ID.userAminata),
          eq(memberships.organizationId, ID.orgManguiers),
          eq(memberships.role, 'enseignant'),
        ),
      );
  });
}

/**
 * Insère le jeu de démonstration fictif. Idempotent : peut être relancé sans doublon.
 *
 * - École Les Manguiers : CP1-A (Koffi, Awa, Kouamé, Aya) et CP1-B (Aminata, Seydou) ;
 *   Bamba en est le directeur.
 * - École Les Baobabs : CE1-A (Moussa), sans personnel de démonstration (test d'isolation).
 * - Fatou est la mère d'Awa (lien vérifié) ; son lien vers Seydou est en attente.
 * - Programmes fictifs : voir database/curricula. Un cours fictif en brouillon (M. Koffi).
 * - Bilan de lecture fictif (rattrapage, ticket 17) : voir remediation/demo-diagnostic.ts.
 * - Atelier virtuel fictif (sécurité électrique, ticket 18) : voir simulation/demo-simulation.ts.
 * - Activité fictive de 12 élèves pour le tableau de chiffres (ticket 20) : stats/demo-activity.ts.
 */
export async function seedDemo(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values([
        {
          id: ID.orgRegion,
          name: 'Direction régionale de démonstration (fictive)',
          type: 'authority',
        },
        {
          id: ID.orgManguiers,
          name: 'École primaire Les Manguiers (fictive)',
          type: 'primary',
          parentId: ID.orgRegion,
        },
        {
          id: ID.orgBaobabs,
          name: 'École primaire Les Baobabs (fictive)',
          type: 'primary',
          parentId: ID.orgRegion,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(users)
      .values([
        {
          id: ID.userAwa,
          oidcSubject: SUB.awa,
          accountType: 'minor',
          displayName: 'Awa (fictive)',
        },
        {
          id: ID.userKoffi,
          oidcSubject: SUB.koffi,
          accountType: 'staff',
          displayName: 'M. Koffi (fictif)',
        },
        {
          id: ID.userMariam,
          oidcSubject: SUB.mariam,
          accountType: 'staff',
          displayName: 'Mme Mariam (fictive)',
        },
        { id: ID.userYao, oidcSubject: SUB.yao, accountType: 'staff', displayName: 'Yao (fictif)' },
        {
          id: ID.userAminata,
          oidcSubject: SUB.aminata,
          accountType: 'staff',
          displayName: 'Mme Aminata (fictive)',
        },
        {
          id: ID.userFatou,
          oidcSubject: SUB.fatou,
          accountType: 'adult',
          displayName: 'Fatou (fictive)',
        },
        {
          id: ID.userBamba,
          oidcSubject: SUB.bamba,
          accountType: 'staff',
          displayName: 'M. Bamba (fictif)',
        },
        // Élèves sans compte de connexion : identifiants techniques réservés aux données de démo.
        {
          id: ID.learnerKouame,
          oidcSubject: 'seed:kouame',
          accountType: 'minor',
          displayName: 'Kouamé (fictif)',
        },
        {
          id: ID.learnerAya,
          oidcSubject: 'seed:aya',
          accountType: 'minor',
          displayName: 'Aya (fictive)',
        },
        {
          id: ID.learnerSeydou,
          oidcSubject: 'seed:seydou',
          accountType: 'minor',
          displayName: 'Seydou (fictif)',
        },
        {
          id: ID.learnerMoussa,
          oidcSubject: 'seed:moussa',
          accountType: 'minor',
          displayName: 'Moussa (fictif)',
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(memberships)
      .values([
        { userId: ID.userBamba, organizationId: ID.orgManguiers, role: 'chef-etablissement' },
        { userId: ID.userKoffi, organizationId: ID.orgManguiers, role: 'enseignant' },
        { userId: ID.userAminata, organizationId: ID.orgManguiers, role: 'enseignant' },
        { userId: ID.userMariam, organizationId: ID.orgRegion, role: 'referent-pedagogique' },
        { userId: ID.userAwa, organizationId: ID.orgManguiers, role: 'apprenant' },
        { userId: ID.learnerKouame, organizationId: ID.orgManguiers, role: 'apprenant' },
        { userId: ID.learnerAya, organizationId: ID.orgManguiers, role: 'apprenant' },
        { userId: ID.learnerSeydou, organizationId: ID.orgManguiers, role: 'apprenant' },
        { userId: ID.learnerMoussa, organizationId: ID.orgBaobabs, role: 'apprenant' },
      ])
      .onConflictDoNothing();

    // Démonstration du filtrage par cycle (ADR-019) : l'enseignante ne rédige que dans le primaire.
    await tx
      .update(memberships)
      .set({ branches: ['primaire'] })
      .where(
        and(
          eq(memberships.userId, ID.userAminata),
          eq(memberships.organizationId, ID.orgManguiers),
          eq(memberships.role, 'enseignant'),
        ),
      );

    await tx
      .insert(cohorts)
      .values([
        {
          id: ID.cohortCp1A,
          organizationId: ID.orgManguiers,
          code: 'CP1-A',
          name: 'CP1 A',
          schoolYear: SCHOOL_YEAR,
        },
        {
          id: ID.cohortCp1B,
          organizationId: ID.orgManguiers,
          code: 'CP1-B',
          name: 'CP1 B',
          schoolYear: SCHOOL_YEAR,
        },
        {
          id: ID.cohortCe1Baobabs,
          organizationId: ID.orgBaobabs,
          code: 'CE1-A',
          name: 'CE1 A',
          schoolYear: SCHOOL_YEAR,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(cohortMembers)
      .values([
        { cohortId: ID.cohortCp1A, userId: ID.userKoffi, role: 'enseignant' },
        { cohortId: ID.cohortCp1A, userId: ID.userAwa, role: 'apprenant' },
        { cohortId: ID.cohortCp1A, userId: ID.learnerKouame, role: 'apprenant' },
        { cohortId: ID.cohortCp1A, userId: ID.learnerAya, role: 'apprenant' },
        { cohortId: ID.cohortCp1B, userId: ID.userAminata, role: 'enseignant' },
        { cohortId: ID.cohortCp1B, userId: ID.learnerSeydou, role: 'apprenant' },
        { cohortId: ID.cohortCe1Baobabs, userId: ID.learnerMoussa, role: 'apprenant' },
      ])
      .onConflictDoNothing();

    await tx
      .insert(guardianLinks)
      .values([
        {
          guardianUserId: ID.userFatou,
          learnerUserId: ID.userAwa,
          status: 'verified',
          verifiedAt: sql`now()`,
        },
        { guardianUserId: ID.userFatou, learnerUserId: ID.learnerSeydou, status: 'pending' },
      ])
      .onConflictDoNothing();
  });

  await seedDemoCurricula(db);
  await seedDemoCourses(db);
  await seedDemoDiagnostic(db);
  await seedDemoSimulation(db);
  await seedDemoActivity(db);
}
