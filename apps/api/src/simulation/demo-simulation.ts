import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  competencies,
  curricula,
  curriculumVersions,
  safetySimulations,
  type SimulationStepDef,
} from '../db/schema.js';

/** Code de la simulation de démonstration (adresse de la page, tests). */
export const DEMO_SIMULATION = 'DEMO-ATELIER-ELEC';

/**
 * Atelier virtuel FICTIF : mettre un circuit en sécurité avant d'intervenir. Contenu de
 * démonstration, à faire valider par des formateurs avant tout usage réel (cahier §7).
 */
const STEPS: SimulationStepDef[] = [
  {
    kind: 'identify',
    id: 'materiel',
    title: 'Reconnaître le matériel',
    instructions: 'Choisis le bon matériel pour chaque question.',
    questions: [
      {
        prompt: 'Quel appareil montre qu’il n’y a plus de courant ?',
        choices: ['Un tournevis', 'Un vérificateur d’absence de tension (VAT)', 'Une pince'],
        correct: 1,
        explanation:
          'Seul le vérificateur d’absence de tension (VAT) prouve qu’il n’y a plus de courant.',
      },
      {
        prompt: 'Quelle pièce du tableau électrique coupe le courant d’un circuit ?',
        choices: ['Le disjoncteur', 'La prise', 'L’ampoule'],
        correct: 0,
        explanation: 'Le disjoncteur du tableau coupe le courant du circuit.',
      },
      {
        prompt: 'Quel objet empêche de remettre le courant pendant le travail ?',
        choices: ['Un ruban adhésif', 'Un cadenas de consignation', 'Un mot au voisin'],
        correct: 1,
        explanation:
          'Le cadenas de consignation bloque le disjoncteur en position coupée ; la clé reste avec toi.',
      },
    ],
  },
  {
    kind: 'equipment',
    id: 'epi',
    title: 'Choisir ses équipements de protection',
    instructions: 'Coche tout ce qu’il faut porter, et seulement cela.',
    options: [
      'Gants isolants',
      'Lunettes de protection',
      'Chaussures de sécurité',
      'Montre ou bracelet en métal',
      'Écouteurs dans les oreilles',
    ],
    required: [0, 1, 2],
    explanations: [
      'Les gants isolants protègent tes mains du courant.',
      'Les lunettes protègent tes yeux d’une étincelle.',
      'Les chaussures de sécurité protègent tes pieds et t’isolent du sol.',
      'Le métal conduit le courant : on enlève montre, bague et bracelet.',
      'Il faut bien entendre le formateur : pas d’écouteurs à l’atelier.',
    ],
  },
  {
    kind: 'order',
    id: 'consignation',
    title: 'Mettre le circuit en sécurité',
    instructions: 'Range les gestes dans l’ordre, du premier au dernier.',
    gestures: [
      'Vérifier l’absence de tension avec le VAT',
      'Mettre ses équipements de protection',
      'Poser le cadenas et la pancarte « Ne pas remettre le courant »',
      'Commencer le travail, sous le regard du formateur',
      'Couper le disjoncteur du circuit',
    ],
    correctOrder: [1, 4, 2, 0, 3],
    explanations: [
      'On vérifie l’absence de tension juste avant de travailler : c’est la seule preuve que le circuit est coupé.',
      'On se protège avant de toucher à l’installation.',
      'Le cadenas et la pancarte empêchent quelqu’un de remettre le courant.',
      'On ne commence qu’à la fin, une fois tout vérifié, et jamais seul.',
      'On coupe le courant avant de bloquer le disjoncteur.',
    ],
  },
];

/**
 * Simulation FICTIVE rattachée au référentiel de démonstration DEMO-ELEC 2026 : elle vérifie
 * SECU-02 (consigner une installation) et ouvre la séance pratique de INST-01. Idempotent.
 */
export async function seedDemoSimulation(db: Database): Promise<void> {
  const [version] = await db
    .select({ id: curriculumVersions.id })
    .from(curriculumVersions)
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .where(and(eq(curricula.code, 'DEMO-ELEC'), eq(curriculumVersions.label, '2026')));
  if (!version) return;
  const rows = await db
    .select({ id: competencies.id, code: competencies.code })
    .from(competencies)
    .where(
      and(
        eq(competencies.versionId, version.id),
        inArray(competencies.code, ['SECU-02', 'INST-01']),
      ),
    );
  const idOf = new Map(rows.map((r) => [r.code, r.id]));
  await db
    .insert(safetySimulations)
    .values({
      code: DEMO_SIMULATION,
      title: 'Atelier virtuel : mettre un circuit en sécurité (démonstration)',
      curriculumVersionId: version.id,
      competencyId: idOf.get('SECU-02')!,
      practiceCompetencyId: idOf.get('INST-01')!,
      steps: STEPS,
    })
    .onConflictDoNothing();
}
