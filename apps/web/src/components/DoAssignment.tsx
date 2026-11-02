'use client';

import type { ExerciseAnswer, MySubmission } from '@lenseignement/types';
import { useEffect, useState } from 'react';
import {
  forgetAssignment,
  keepAssignment,
  markAssignmentAnswered,
  useKeptAssignments,
  type KeptAssignment,
} from '@/lib/offline-assignments';
import { queueAction, stamp } from '@/lib/offline-queue';
import { AssignmentExercisesForm, type AnswersOutcome } from './AssignmentExercises';
import { buttonClass, secondaryButtonClass } from './Notice';

type Assignment = Omit<KeptAssignment, 'keptAt' | 'answeredAt'>;

/** Garde les réponses sur l'appareil ; elles partiront au retour d'internet. */
async function queueAnswers(
  assignment: Assignment,
  answers: ExerciseAnswer[],
  attemptId: string,
): Promise<AnswersOutcome> {
  try {
    await queueAction({
      owner: assignment.owner,
      event: {
        type: 'assignment_answers',
        operationId: attemptId,
        occurredAt: stamp().occurredAt,
        assignmentId: assignment.id,
        answers,
      },
    });
    try {
      markAssignmentAnswered(assignment.id);
    } catch {
      // Devoir pas gardé : rien à noter.
    }
    return { kind: 'queued' };
  } catch {
    return { kind: 'error', message: 'Réponses non gardées : réessaie.' };
  }
}

/** Demande au service worker de garder la page « Hors connexion » à jour (elle montre le devoir). */
async function keepOfflinePage(): Promise<void> {
  const worker = (await navigator.serviceWorker?.ready)?.active;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    setTimeout(resolve, 20_000);
    worker.postMessage({ type: 'keep', paths: ['/hors-ligne'] }, [channel.port2]);
  });
}

/** « Garder ce devoir sur cet appareil » : l'élève pourra le faire sans connexion. */
export function KeepAssignmentButton({ assignment }: { assignment: Assignment }) {
  const kept = useKeptAssignments().some((a) => a.id === assignment.id);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  async function keep() {
    setState('busy');
    try {
      await keepOfflinePage();
      await keepAssignment(assignment);
      setState('idle');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="space-y-2">
      {kept ? (
        <button
          type="button"
          onClick={() => void forgetAssignment(assignment.id)}
          className={secondaryButtonClass}
        >
          Retirer de cet appareil
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void keep()}
          disabled={state === 'busy'}
          className={secondaryButtonClass}
        >
          {state === 'busy' ? 'Téléchargement…' : 'Garder ce devoir sur cet appareil'}
        </button>
      )}
      <p role="status" aria-live="polite" data-testid="keep-assignment-status">
        {kept &&
          '✓ Ce devoir est sur cet appareil : tu peux le faire sans connexion. Tes réponses seront envoyées au retour d’internet.'}
        {!kept &&
          state === 'failed' &&
          'Le devoir n’a pas pu être gardé. Vérifie la connexion et la place libre, puis réessaie.'}
      </p>
    </div>
  );
}

/**
 * Le devoir à faire en ligne : la plateforme corrige tout de suite. Si la connexion tombe au
 * moment de rendre, les réponses sont gardées et partent au retour d'internet.
 */
export function DoAssignment({
  assignment,
  answer,
}: {
  assignment: Assignment;
  answer: (
    id: string,
    answers: ExerciseAnswer[],
    attemptId: string,
  ) => Promise<{ submission: MySubmission } | { error: string }>;
}) {
  async function send(answers: ExerciseAnswer[], attemptId: string): Promise<AnswersOutcome> {
    if (!navigator.onLine) return queueAnswers(assignment, answers, attemptId);
    try {
      const result = await answer(assignment.id, answers, attemptId);
      if ('error' in result) return { kind: 'error', message: result.error };
      try {
        await forgetAssignment(assignment.id);
      } catch {
        // Rien à retirer.
      }
      return { kind: 'graded', submission: result.submission };
    } catch {
      return queueAnswers(assignment, answers, attemptId);
    }
  }

  return (
    <AssignmentExercisesForm
      exercises={assignment.exercises}
      maxScore={assignment.maxScore}
      send={send}
    />
  );
}

const DEVOIR_IN_PATH = /^\/mon-espace\/devoirs\/([0-9a-f-]{36})\/faire\/?$/;

/** Page « Hors connexion » : les devoirs gardés sur l'appareil se font même sans réseau. */
export function OfflineAssignments() {
  const kept = useKeptAssignments();
  const [open, setOpen] = useState<string | null>(null);

  // Devoir demandé sans connexion (adresse de sa page) : il s'ouvre directement.
  useEffect(() => {
    const match = DEVOIR_IN_PATH.exec(window.location.pathname);
    if (match) setOpen(match[1]!);
  }, []);

  if (kept.length === 0) return null;
  const current = kept.find((a) => a.id === open);
  return (
    <section className="space-y-3 pt-4" data-testid="offline-assignments">
      <h2 className="text-2xl font-bold">Mes devoirs sur cet appareil</h2>
      {current ? (
        <article className="space-y-4 rounded-card border border-line bg-surface p-4">
          <div className="space-y-1">
            <p className="font-bold text-ink-muted">{current.cohortName} · sans connexion</p>
            <h3 className="text-2xl font-bold">{current.title}</h3>
          </div>
          <p className="whitespace-pre-line">{current.instructions}</p>
          {current.answeredAt ? (
            <p
              role="status"
              className="rounded-card border-2 border-primary bg-primary-soft p-3 font-bold text-ink-strong"
              data-testid="assignment-queued"
            >
              ✓ Tes réponses sont gardées sur cet appareil. Elles seront envoyées et corrigées au
              retour d’internet.
            </p>
          ) : (
            <AssignmentExercisesForm
              exercises={current.exercises}
              maxScore={current.maxScore}
              send={(answers, attemptId) => queueAnswers(current, answers, attemptId)}
            />
          )}
          <button type="button" onClick={() => setOpen(null)} className={secondaryButtonClass}>
            Fermer le devoir
          </button>
        </article>
      ) : (
        <>
          <p>Ils se font même sans connexion.</p>
          <ul className="space-y-2">
            {kept.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a.id)} className={buttonClass}>
                  {a.answeredAt ? '✓ ' : ''}Faire « {a.title} »
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Devoir corrigé : sa copie gardée sur l'appareil ne sert plus, elle est retirée. */
export function ForgetDoneAssignment({ id }: { id: string }) {
  useEffect(() => {
    void forgetAssignment(id).catch(() => undefined);
  }, [id]);
  return null;
}
