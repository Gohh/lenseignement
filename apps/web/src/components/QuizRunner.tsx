'use client';

import type { QuizLastAttempt, QuizQuestion } from '@lenseignement/types';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { submitQuizAction, type QuizState } from '@/app/catalogue/actions';
import { queueAction } from '@/lib/offline-queue';
import { buttonClass, secondaryButtonClass } from './Notice';
import { SpeakButton } from './SpeakButton';

interface Props {
  courseId: string;
  lessonNumber: number;
  questions: QuizQuestion[];
  /** « attempt » : tentative enregistrée (personne inscrite) ; « check » : simple correction. */
  mode: 'attempt' | 'check';
  /** Identifiant de la première tentative, tiré par le serveur (un renvoi ne la double pas). */
  attemptId: string;
  last: QuizLastAttempt | null;
  /** Empreinte de la personne inscrite : permet de garder la tentative hors ligne (ADR-012). */
  owner?: string;
  /** Langue du cours, pour l'écoute des questions et réponses (ADR-015). */
  lang?: string;
}

type RoundState = QuizState | { ok: 'queued' } | { ok: 'offline' };

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
  owner,
  lang = 'fr',
  onRestart,
}: Props & { onRestart: () => void }) {
  // Tentative gardée sur l'appareil ; l'API la corrigera à l'envoi (ADR-012).
  async function keep(form: FormData, operationId: string): Promise<RoundState> {
    const answers = [...form.entries()]
      .filter(([name]) => name.startsWith('q-'))
      .map(([name, value]) => ({ questionId: name.slice(2), choice: Number(value) }));
    await queueAction({
      owner: owner!,
      event: {
        operationId,
        occurredAt: new Date().toISOString(),
        type: 'quiz_submitted',
        courseId,
        lessonNumber,
        answers,
      },
    });
    return { ok: 'queued' };
  }

  const keepable = mode === 'attempt' && Boolean(owner);
  const [state, action, pending] = useActionState<RoundState, FormData>(async (previous, form) => {
    if (navigator.onLine) {
      try {
        return await submitQuizAction(previous as QuizState, form);
      } catch {
        // Réseau perdu pendant l'envoi : même identifiant de tentative, donc jamais deux
        // tentatives si la première était en fait arrivée.
        return keepable ? keep(form, attemptId) : { ok: 'offline' };
      }
    }
    // Page peut-être ouverte depuis l'appareil : nouvel identifiant pour chaque tentative.
    return keepable ? keep(form, crypto.randomUUID()) : { ok: 'offline' };
  }, null);
  const result = state?.ok === true ? state.result : null;
  const queued = state?.ok === 'queued';
  const score = result
    ? `Résultat : ${result.score} sur ${result.total}${result.score === result.total ? '. Bravo !' : '.'}`
    : queued
      ? 'Réponses gardées sur cet appareil, en attente de synchronisation. Le résultat s’affichera quand internet reviendra.'
      : '';

  // Envoi sans remise à zéro du formulaire : les réponses cochées restent visibles (brouillon
  // conservé si le réseau manque, E2E-07).
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  }

  return (
    <form action={action} onSubmit={submit} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="lessonNumber" value={lessonNumber} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="attemptId" value={attemptId} />
      {questions.map((q, i) => {
        const item = result?.items.find((it) => it.questionId === q.id);
        // Réponses figées après l'envoi ; les boutons d'écoute restent utilisables.
        return (
          <fieldset key={q.id} className="space-y-1">
            <legend className="font-bold">
              Question {i + 1} : {q.prompt}
            </legend>
            <SpeakButton
              text={`${q.prompt}\n${q.choices.join('.\n')}.`}
              lang={lang}
              label={`Écouter la question ${i + 1}`}
            />
            {q.choices.map((choice, c) => (
              <div key={c} className="flex items-center gap-2">
                <label className="flex min-h-[44px] flex-1 items-center gap-3">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={c}
                    required
                    disabled={Boolean(result) || queued}
                    className="h-5 w-5"
                  />
                  {choice}
                </label>
                <SpeakButton text={choice} lang={lang} label={`Écouter la réponse : ${choice}`} />
              </div>
            ))}
            {item && (
              <div data-testid="quiz-feedback" className="rounded-card border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">
                    {item.correct
                      ? '✓ Bonne réponse.'
                      : `✗ La bonne réponse était : ${q.choices[item.correctChoice]}.`}
                  </p>
                  <SpeakButton
                    text={`${item.correct ? 'Bonne réponse.' : `La bonne réponse était : ${q.choices[item.correctChoice]}.`}\n${item.explanation ?? ''}`}
                    lang={lang}
                    label={`Écouter la correction de la question ${i + 1}`}
                  />
                </div>
                {item.explanation && <p>{item.explanation}</p>}
              </div>
            )}
          </fieldset>
        );
      })}
      {state?.ok === false && (
        <p role="alert" className="font-bold text-error">
          {state.message}
        </p>
      )}
      {state?.ok === 'offline' && (
        <p role="alert" className="font-bold text-error">
          Pas de connexion : la correction a besoin d’internet. Vos réponses restent cochées,
          réessayez quand la connexion revient.
        </p>
      )}
      <p role="status" aria-live="polite" data-testid="quiz-score" className="text-lg font-bold">
        {score}
      </p>
      {score && <SpeakButton text={score} lang={lang} label="Écouter le résultat" />}
      {queued ? null : result ? (
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
