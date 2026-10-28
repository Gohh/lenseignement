import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  competencies,
  curricula,
  curriculumVersions,
  diagnosticItems,
  diagnostics,
} from '../db/schema.js';

/** Code du bilan de démonstration (adresse de la page, tests). */
export const DEMO_DIAGNOSTIC = 'DEMO-LECTURE-CP';

interface DemoItem {
  competency: string;
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
}

/** Deux questions par compétence pour le bilan, deux autres pour le petit test. FICTIF. */
const DIAGNOSTIC: DemoItem[] = [
  {
    competency: 'LECT-01',
    prompt: 'Quelle est la lettre « m » ?',
    choices: ['n', 'm', 'w'],
    correct: 1,
    explanation: 'Le m a deux ponts.',
  },
  {
    competency: 'LECT-01',
    prompt: 'Quelle est la lettre « i » ?',
    choices: ['i', 'l', 'j'],
    correct: 0,
    explanation: 'Le i est un petit bâton avec un point.',
  },
  {
    competency: 'LECT-02',
    prompt: 'm et a se lisent :',
    choices: ['am', 'ma', 'mi'],
    correct: 1,
    explanation: 'On lit d’abord le m, puis le a : ma.',
  },
  {
    competency: 'LECT-02',
    prompt: 'p et i se lisent :',
    choices: ['pi', 'pa', 'ip'],
    correct: 0,
    explanation: 'On lit d’abord le p, puis le i : pi.',
  },
  {
    competency: 'LECT-03',
    prompt: 'pa et pa se lisent :',
    choices: ['papa', 'pipa', 'mama'],
    correct: 0,
    explanation: 'pa, puis encore pa : papa.',
  },
  {
    competency: 'LECT-03',
    prompt: 'lu et ne se lisent :',
    choices: ['nule', 'lune', 'lame'],
    correct: 1,
    explanation: 'lu, puis ne : lune.',
  },
  {
    competency: 'LECT-04',
    prompt: '« Ama mange une mangue. » Que mange Ama ?',
    choices: ['Une banane', 'Une mangue', 'Du riz'],
    correct: 1,
    explanation: 'La phrase dit : une mangue.',
  },
  {
    competency: 'LECT-04',
    prompt: '« Le chat dort sous la table. » Où dort le chat ?',
    choices: ['Sous la table', 'Sur le lit', 'Dehors'],
    correct: 0,
    explanation: 'La phrase dit : sous la table.',
  },
];

const POST_TEST: DemoItem[] = [
  {
    competency: 'LECT-01',
    prompt: 'Quelle est la lettre « a » ?',
    choices: ['o', 'e', 'a'],
    correct: 2,
    explanation: 'Le a est un rond avec une petite canne.',
  },
  {
    competency: 'LECT-01',
    prompt: 'Quelle est la lettre « p » ?',
    choices: ['b', 'p', 'd'],
    correct: 1,
    explanation: 'Le p a une canne qui descend.',
  },
  {
    competency: 'LECT-02',
    prompt: 'l et a se lisent :',
    choices: ['al', 'li', 'la'],
    correct: 2,
    explanation: 'On lit d’abord le l, puis le a : la.',
  },
  {
    competency: 'LECT-02',
    prompt: 't et o se lisent :',
    choices: ['to', 'ot', 'ta'],
    correct: 0,
    explanation: 'On lit d’abord le t, puis le o : to.',
  },
  {
    competency: 'LECT-03',
    prompt: 'ma et mi se lisent :',
    choices: ['mima', 'mama', 'mami'],
    correct: 2,
    explanation: 'ma, puis mi : mami.',
  },
  {
    competency: 'LECT-03',
    prompt: 'vé et lo se lisent :',
    choices: ['vélo', 'lové', 'valo'],
    correct: 0,
    explanation: 'vé, puis lo : vélo.',
  },
  {
    competency: 'LECT-04',
    prompt: '« Papa va au marché. » Où va papa ?',
    choices: ['À l’école', 'Au marché', 'Au champ'],
    correct: 1,
    explanation: 'La phrase dit : au marché.',
  },
  {
    competency: 'LECT-04',
    prompt: '« Le bébé boit du lait. » Que boit le bébé ?',
    choices: ['De l’eau', 'Du jus', 'Du lait'],
    correct: 2,
    explanation: 'La phrase dit : du lait.',
  },
];

/**
 * Bilan de lecture FICTIF, rattaché au programme de démonstration 2026 (compétences LECT-01 à
 * LECT-04). Idempotent ; ses questions sont figées une fois créées.
 */
export async function seedDemoDiagnostic(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const [programme] = await tx
      .select({ id: curriculumVersions.id })
      .from(curriculumVersions)
      .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
      .where(and(eq(curricula.code, 'DEMO-PRIMAIRE'), eq(curriculumVersions.label, '2026')));
    if (!programme) return;
    const [created] = await tx
      .insert(diagnostics)
      .values({
        code: DEMO_DIAGNOSTIC,
        title: 'Bilan de lecture CP (démonstration)',
        curriculumVersionId: programme.id,
      })
      .onConflictDoNothing()
      .returning({ id: diagnostics.id });
    if (!created) return;
    const rows = await tx
      .select({ id: competencies.id, code: competencies.code })
      .from(competencies)
      .where(
        and(
          eq(competencies.versionId, programme.id),
          inArray(competencies.code, ['LECT-01', 'LECT-02', 'LECT-03', 'LECT-04']),
        ),
      );
    const idOf = new Map(rows.map((r) => [r.code, r.id]));
    const toRows = (items: DemoItem[], phase: 'diagnostic' | 'post_test') =>
      items.map((item, position) => ({
        diagnosticId: created.id,
        competencyId: idOf.get(item.competency)!,
        phase,
        position,
        prompt: item.prompt,
        choices: item.choices,
        correctChoice: item.correct,
        explanation: item.explanation,
      }));
    await tx
      .insert(diagnosticItems)
      .values([...toRows(DIAGNOSTIC, 'diagnostic'), ...toRows(POST_TEST, 'post_test')]);
  });
}
