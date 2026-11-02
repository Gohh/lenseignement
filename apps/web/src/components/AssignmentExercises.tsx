'use client';

import type {
  AssignmentExerciseResult,
  ExerciseAnswer,
  ExercisePlay,
  MySubmission,
} from '@lenseignement/types';
import { useState, useTransition } from 'react';
import { ExerciseInputs } from './ExercisePlayer';
import { buttonClass } from './Notice';

/** Correction d'un devoir fait d'exercices : la note, puis chaque exercice. */
export function AssignmentResults({
  results,
  score,
  maxScore,
}: {
  results: AssignmentExerciseResult[];
  score: number | null;
  maxScore: number;
}) {
  // Évaluation de zone en cours : la copie est rendue, la note s'ouvre à la clôture.
  if (score === null && results.length === 0) {
    return (
      <p
        className="rounded-card border-l-4 border-primary bg-primary-soft p-3 font-bold"
        data-testid="results-hidden"
      >
        Copie rendue. Ta note sera visible à la fin de l’évaluation.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="assignment-results">
      {score != null && (
        <p className="text-lg font-bold">
          Note : {score}/{maxScore}
        </p>
      )}
      <ol className="space-y-2">
        {results.map((r, i) => (
          <li
            key={r.exerciseId}
            className={`rounded-card border-l-4 p-3 ${r.correct ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface'}`}
          >
            <p className="font-bold">
              {i + 1}. {r.title} :{' '}
              {r.correct ? '✓ réussi' : `à revoir (${Math.round(r.score * 100)} % des points)`}
            </p>
            {r.feedback.map((line, k) => (
              <p key={k}>{line}</p>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

export type AnswersOutcome =
  | { kind: 'graded'; submission: MySubmission }
  | { kind: 'queued' }
  | { kind: 'error'; message: string };

/**
 * Tous les exercices d'un devoir dans un seul formulaire. `send` corrige en ligne (action
 * serveur) ou garde l'envoi sur l'appareil sans connexion.
 */
export function AssignmentExercisesForm({
  exercises,
  maxScore,
  send,
  preview = false,
}: {
  exercises: Array<{ id: string; title: string; play: ExercisePlay }>;
  maxScore: number;
  send?: (answers: ExerciseAnswer[], attemptId: string) => Promise<AnswersOutcome>;
  /** Vue de l'enseignant : les exercices sans bouton pour rendre. */
  preview?: boolean;
}) {
  const [answers, setAnswers] = useState<ExerciseAnswer[]>(() =>
    exercises.map(() => ({ choices: [], texts: [] })),
  );
  const [attemptId] = useState(() => crypto.randomUUID());
  const [outcome, setOutcome] = useState<AnswersOutcome | null>(null);
  const [pending, start] = useTransition();

  if (outcome?.kind === 'graded') {
    return (
      <div className="space-y-3">
        <p role="status" className="font-bold">
          {outcome.submission.score === null ? '✓ Devoir rendu.' : '✓ Devoir rendu et corrigé.'}
        </p>
        <AssignmentResults
          results={outcome.submission.results ?? []}
          score={outcome.submission.score}
          maxScore={maxScore}
        />
      </div>
    );
  }
  if (outcome?.kind === 'queued') {
    return (
      <p
        role="status"
        className="rounded-card border-2 border-primary bg-primary-soft p-3 font-bold text-ink-strong"
        data-testid="assignment-queued"
      >
        ✓ Tes réponses sont gardées sur cet appareil. Elles seront envoyées et corrigées au retour
        d’internet.
      </p>
    );
  }

  return (
    <form
      className="space-y-6"
      data-testid="assignment-exercises"
      onSubmit={(event) => {
        event.preventDefault();
        if (!send) return;
        start(async () => setOutcome(await send(answers, attemptId)));
      }}
    >
      <ol className="space-y-6">
        {exercises.map((exercise, i) => (
          <li key={exercise.id}>
            <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
              <legend className="px-1 font-display text-lg font-bold">
                Exercice {i + 1} sur {exercises.length}
              </legend>
              <ExerciseInputs
                play={exercise.play}
                answer={answers[i]!}
                name={`ex${i}`}
                onChange={(answer) =>
                  setAnswers((list) => list.map((a, k) => (k === i ? answer : a)))
                }
              />
            </fieldset>
          </li>
        ))}
      </ol>
      {outcome?.kind === 'error' && (
        <p role="alert" className="font-bold text-error">
          {outcome.message}
        </p>
      )}
      {!preview && (
        <>
          <p className="text-ink-muted">
            Vérifie tes réponses : une fois rendu, le devoir est corrigé et ne se modifie plus.
          </p>
          <button type="submit" className={buttonClass} disabled={pending}>
            {pending ? 'Envoi…' : 'Rendre mon devoir'}
          </button>
        </>
      )}
    </form>
  );
}
