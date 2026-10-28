import type {
  SimulationOverview,
  SimulationStep,
  SimulationStepResult,
  SimulationSubmission,
} from '@lenseignement/types';
import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database, Executor } from '../db/database.js';
import {
  competencies,
  curricula,
  curriculumVersions,
  practiceRequests,
  safetySimulations,
  simulationAttempts,
  users,
  type SimulationStepDef,
} from '../db/schema.js';
import { LearningError } from '../learning/learning.js';

/**
 * Atelier virtuel (ADR-014). Règle V1, déterministe : la simulation est réussie quand chaque
 * étape est entièrement juste. Seul un dernier essai réussi ouvre la demande de séance pratique,
 * qui se fait toujours avec le formateur (cahier §4.3 : jamais de manipulation risquée seul).
 */

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

async function loadSimulation(db: Executor, code: string) {
  const safety = alias(competencies, 'safety');
  const practice = alias(competencies, 'practice');
  const [row] = await db
    .select({
      simulation: safetySimulations,
      curriculumCode: curricula.code,
      label: curriculumVersions.label,
      competency: { code: safety.code, title: safety.title },
      practice: { code: practice.code, title: practice.title },
    })
    .from(safetySimulations)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, safetySimulations.curriculumVersionId))
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .innerJoin(safety, eq(safety.id, safetySimulations.competencyId))
    .innerJoin(practice, eq(practice.id, safetySimulations.practiceCompetencyId))
    .where(eq(safetySimulations.code, code));
  if (!row) throw new LearningError('not_found', 'Simulation introuvable.');
  return row;
}

/** Étape telle qu'affichée : sans corrigé ni explications. */
function publicStep(step: SimulationStepDef): SimulationStep {
  const { id, title, instructions } = step;
  if (step.kind === 'identify') {
    return {
      kind: 'identify',
      id,
      title,
      instructions,
      questions: step.questions.map((q) => ({ prompt: q.prompt, choices: q.choices })),
    };
  }
  if (step.kind === 'equipment') {
    return { kind: 'equipment', id, title, instructions, options: step.options };
  }
  return { kind: 'order', id, title, instructions, gestures: step.gestures };
}

const invalid = (message: string) => new LearningError('invalid', message);

/** Correction d'une étape, avec ce qu'il faut revoir en phrases simples. */
export function gradeStep(step: SimulationStepDef, choices: number[]): SimulationStepResult {
  const feedback: string[] = [];
  if (step.kind === 'identify') {
    if (
      choices.length !== step.questions.length ||
      choices.some((c, i) => c >= step.questions[i]!.choices.length)
    ) {
      throw invalid('Réponds à chaque question du matériel.');
    }
    step.questions.forEach((q, i) => {
      if (choices[i] !== q.correct) feedback.push(`${q.prompt} ${q.explanation}`);
    });
  } else if (step.kind === 'equipment') {
    const taken = new Set(choices);
    if (taken.size !== choices.length || choices.some((c) => c >= step.options.length)) {
      throw invalid('Chaque équipement ne se coche qu’une fois.');
    }
    step.options.forEach((option, i) => {
      const needed = step.required.includes(i);
      if (needed && !taken.has(i)) feedback.push(`Il manque : ${option}. ${step.explanations[i]}`);
      if (!needed && taken.has(i)) feedback.push(`À laisser : ${option}. ${step.explanations[i]}`);
    });
  } else {
    const n = step.gestures.length;
    if (choices.length !== n || new Set(choices).size !== n || choices.some((c) => c >= n)) {
      throw invalid('Donne une place à chaque geste, une seule fois.');
    }
    step.correctOrder.forEach((gesture, position) => {
      if (choices[position] !== gesture) {
        feedback.push(
          `« ${step.gestures[gesture]} » est le ${ordinal(position + 1)} geste. ${step.explanations[gesture]}`,
        );
      }
    });
  }
  return { stepId: step.id, title: step.title, passed: feedback.length === 0, feedback };
}

/** Une réponse, et une seule, pour chaque étape de la simulation. */
export function grade(steps: SimulationStepDef[], answers: SimulationSubmission['steps']) {
  const byStep = new Map(answers.map((a) => [a.stepId, a.choices]));
  if (byStep.size !== answers.length || byStep.size !== steps.length) {
    throw invalid('Fais chaque étape de la simulation, une seule fois.');
  }
  return steps.map((step) => {
    const choices = byStep.get(step.id);
    if (!choices) throw invalid('Fais chaque étape de la simulation, une seule fois.');
    return gradeStep(step, choices);
  });
}

/** Une décision à la fois par apprenant (essai et demande de séance). */
async function lockLearner(tx: Executor, userId: string) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
}

async function latestAttempt(db: Executor, userId: string, simulationId: string) {
  const [attempt] = await db
    .select()
    .from(simulationAttempts)
    .where(
      and(eq(simulationAttempts.userId, userId), eq(simulationAttempts.simulationId, simulationId)),
    )
    .orderBy(desc(simulationAttempts.submittedAt), desc(simulationAttempts.id))
    .limit(1);
  return attempt;
}

/** Essai corrigé et enregistré. Idempotent par `attemptId`, pour son auteur seulement. */
export async function submitAttempt(
  db: Database,
  userId: string,
  code: string,
  input: SimulationSubmission,
): Promise<SimulationOverview> {
  const { simulation } = await loadSimulation(db, code);
  const results = grade(simulation.steps, input.steps);
  const created = await db.transaction(async (tx) => {
    await lockLearner(tx, userId);
    const [row] = await tx
      .insert(simulationAttempts)
      .values({
        id: input.attemptId,
        userId,
        simulationId: simulation.id,
        passed: results.every((r) => r.passed),
        answers: input.steps,
        results,
      })
      .onConflictDoNothing()
      .returning({ id: simulationAttempts.id });
    return Boolean(row);
  });
  if (!created) {
    const [existing] = await db
      .select({ userId: simulationAttempts.userId })
      .from(simulationAttempts)
      .where(eq(simulationAttempts.id, input.attemptId));
    if (existing?.userId !== userId) {
      throw new LearningError('conflict', 'Essai déjà enregistré.');
    }
  }
  return overview(db, userId, code);
}

/** Demande de séance pratique encadrée : seulement après un dernier essai réussi (E2E-05). */
export async function requestPractice(
  db: Database,
  userId: string,
  code: string,
): Promise<SimulationOverview> {
  const { simulation } = await loadSimulation(db, code);
  await db.transaction(async (tx) => {
    await lockLearner(tx, userId);
    const [existing] = await tx
      .select({ id: practiceRequests.id })
      .from(practiceRequests)
      .where(
        and(eq(practiceRequests.userId, userId), eq(practiceRequests.simulationId, simulation.id)),
      );
    if (existing) return;
    const latest = await latestAttempt(tx, userId, simulation.id);
    if (!latest?.passed) {
      throw new LearningError(
        'conflict',
        'Réussis d’abord la simulation de sécurité : la séance pratique reste bloquée.',
      );
    }
    await tx
      .insert(practiceRequests)
      .values({ userId, simulationId: simulation.id, attemptId: latest.id });
  });
  return overview(db, userId, code);
}

/** Étapes, dernier essai et état de la séance pratique de l'apprenant. */
export async function overview(
  db: Executor,
  userId: string,
  code: string,
): Promise<SimulationOverview> {
  const row = await loadSimulation(db, code);
  const { simulation } = row;
  const latest = await latestAttempt(db, userId, simulation.id);
  const [{ attempts }] = (await db
    .select({ attempts: sql<number>`count(*)::int` })
    .from(simulationAttempts)
    .where(
      and(
        eq(simulationAttempts.userId, userId),
        eq(simulationAttempts.simulationId, simulation.id),
      ),
    )) as [{ attempts: number }];
  const [request] = await db
    .select({ createdAt: practiceRequests.createdAt })
    .from(practiceRequests)
    .where(
      and(eq(practiceRequests.userId, userId), eq(practiceRequests.simulationId, simulation.id)),
    );
  return {
    simulation: {
      code: simulation.code,
      title: simulation.title,
      curriculum: { code: row.curriculumCode, label: row.label },
      competency: row.competency,
      practice: row.practice,
    },
    steps: simulation.steps.map(publicStep),
    attempts,
    lastAttempt: latest
      ? {
          passed: latest.passed,
          submittedAt: latest.submittedAt.toISOString(),
          steps: latest.results,
        }
      : null,
    practice: request
      ? { status: 'requested', requestedAt: request.createdAt.toISOString() }
      : { status: latest?.passed ? 'unlocked' : 'locked', requestedAt: null },
  };
}
