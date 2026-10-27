'use client';

import type { QuizLastAttempt, QuizQuestion } from '@lenseignement/types';
import { useActionState, useState } from 'react';
import { submitQuizAction, type QuizState } from '@/app/catalogue/actions';
import { buttonClass, secondaryButtonClass } from './Notice';

interface Props {
  courseId: string;
  lessonNumber: number;
  questions: QuizQuestion[];
  /** « attempt » : tentative enregistrée (personne inscrite) ; « check » : simple correction. */
  mode: 'attempt' | 'check';
  /** Identifiant de la première tentative, tiré par le serveur (un renvoi ne la double pas). */
  attemptId: string;
  last: QuizLastAttempt | null;
}

/** Quiz formatif d'une leçon (cahier §4 `QuizRunner`, ADR-010) : réponse, puis correction. */
export function QuizRunner(props: Props) {
  // Recommencer remonte le formulaire avec un nouvel identifiant de tentative.
  const [round, setRound] = useState({ n: 0, attemptId: props.attemptId });
  return (
    <section
      aria-labelledby="quiz"
      className="space-y-4 rounded-card border border-line bg-surface p-4"
    >
      <h2 id="quiz" className="text-xl font-bold">
        Quiz de la leçon
      </h2>
      {props.last && round.n === 0 && (
        <p data-testid="quiz-last">
          Votre dernier résultat : {props.last.score} sur {props.last.total}.
        </p>
      )}
      <QuizRound
        key={round.n}
        {...props}
        attemptId={round.attemptId}
        onRestart={() => setRound((r) => ({ n: r.n + 1, attemptId: crypto.randomUUID() }))}
      />
    </section>
  );
}

function QuizRound({
  courseId,
  lessonNumber,
  questions,
  mode,
  attemptId,
  onRestart,
}: Props & { onRestart: () => void }) {
  const [state, action, pending] = useActionState<QuizState, FormData>(submitQuizAction, null);
  const result = state?.ok ? state.result : null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="lessonNumber" value={lessonNumber} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="attemptId" value={attemptId} />
      {questions.map((q, i) => {
        const item = result?.items.find((it) => it.questionId === q.id);
        return (
          <fieldset key={q.id} className="space-y-1" disabled={Boolean(result)}>
            <legend className="font-bold">
              Question {i + 1} : {q.prompt}
            </legend>
            {q.choices.map((choice, c) => (
              <label key={c} className="flex min-h-[44px] items-center gap-3">
                <input type="radio" name={`q-${q.id}`} value={c} required className="h-5 w-5" />
                {choice}
              </label>
            ))}
            {item && (
              <div data-testid="quiz-feedback" className="rounded-card border border-line p-3">
                <p className="font-bold">
                  {item.correct
                    ? '✓ Bonne réponse.'
                    : `✗ La bonne réponse était : ${q.choices[item.correctChoice]}.`}
                </p>
                {item.explanation && <p>{item.explanation}</p>}
              </div>
            )}
          </fieldset>
        );
      })}
      {state && !state.ok && (
        <p role="alert" className="font-bold text-error">
          {state.message}
        </p>
      )}
      <p role="status" aria-live="polite" data-testid="quiz-score" className="text-lg font-bold">
        {result
          ? `Résultat : ${result.score} sur ${result.total}${result.score === result.total ? '. Bravo !' : '.'}`
          : ''}
      </p>
      {result ? (
        <button type="button" onClick={onRestart} className={secondaryButtonClass}>
          Recommencer le quiz
        </button>
      ) : (
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? 'Correction…' : 'Valider mes réponses'}
        </button>
      )}
      {mode === 'check' && !result && (
        <p className="text-sm text-ink-muted">
          Vos réponses sont corrigées mais pas enregistrées : suivez le cours pour garder vos
          résultats.
        </p>
      )}
    </form>
  );
}
