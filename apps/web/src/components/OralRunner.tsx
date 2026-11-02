'use client';

import {
  ORAL_STOP_RULE,
  oralItems,
  scoreOralPart,
  type OralPartAnswer,
  type OralSheet,
} from '@lenseignement/types';
import { useEffect, useRef, useState } from 'react';
import { queueAction, stamp, syncActions } from '@/lib/offline-queue';
import { buttonClass, secondaryButtonClass } from './Notice';

type Phase = 'intro' | 'running' | 'last' | 'questions' | 'summary';
type Saved = { kind: 'sent' | 'kept' | 'login' | 'error'; message: string };

const blank = (): OralPartAnswer => ({
  errors: [],
  last: null,
  seconds: 0,
  stopped: false,
  answers: [],
});

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Passation d'une épreuve orale, élève par élève : chronomètre, cases à toucher quand l'élève se
 * trompe, dernier élément lu, questions. Tout reste dans la page : sans connexion, le résultat est
 * gardé sur l'appareil et part au retour d'internet. Aucune voix n'est enregistrée.
 */
export function OralRunner({ sheet, owner }: { sheet: OralSheet; owner: string }) {
  const { test, cohort } = sheet;
  const [done, setDone] = useState<Set<string>>(
    () => new Set(sheet.learners.filter((l) => l.done).map((l) => l.id)),
  );
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [answers, setAnswers] = useState<OralPartAnswer[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(0);
  const takenAt = useRef('');

  const part = test.parts[index]!;
  const items = oralItems(part);
  const answer = answers[index] ?? blank();
  const learner = sheet.learners.find((l) => l.id === learnerId) ?? null;

  const update = (patch: Partial<OralPartAnswer>) =>
    setAnswers((all) => all.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  useEffect(() => {
    if (phase !== 'running') return;
    const timer = window.setInterval(() => {
      const left = part.seconds - (Date.now() - startedAt.current) / 1000;
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(timer);
        setAnswers((all) => all.map((a, i) => (i === index ? { ...a, seconds: part.seconds } : a)));
        setPhase('last');
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase, part.seconds, index]);

  function begin(id: string) {
    setLearnerId(id);
    setIndex(0);
    setAnswers(test.parts.map(blank));
    setPhase('intro');
    setSaved(null);
    takenAt.current = new Date().toISOString();
  }

  function next() {
    if (index + 1 < test.parts.length) {
      setIndex(index + 1);
      setPhase('intro');
    } else setPhase('summary');
  }

  function start() {
    if (part.kind === 'questions') {
      setPhase('questions');
      return;
    }
    startedAt.current = Date.now();
    setRemaining(part.seconds);
    setPhase('running');
  }

  function finishEarly() {
    const used = Math.max(1, Math.ceil((Date.now() - startedAt.current) / 1000));
    update({ seconds: Math.min(used, part.seconds), last: items.length - 1 });
    setPhase('last');
  }

  function stopPart() {
    const used = Math.max(1, Math.ceil((Date.now() - startedAt.current) / 1000));
    update({ stopped: true, seconds: Math.min(used, part.seconds) });
    next();
  }

  function confirmLast() {
    if (part.kind === 'texte' && part.questions.length > 0) setPhase('questions');
    else next();
  }

  function tap(i: number) {
    if (phase === 'running') {
      const errors = answer.errors.includes(i)
        ? answer.errors.filter((e) => e !== i)
        : [...answer.errors, i];
      update({ errors });
    } else if (phase === 'last') {
      update({ last: i });
    }
  }

  async function save() {
    if (!learnerId) return;
    setSaving(true);
    const { operationId, occurredAt } = stamp();
    try {
      await queueAction({
        owner,
        event: {
          type: 'oral_result',
          operationId,
          occurredAt,
          testId: test.id,
          cohortId: cohort.id,
          learnerId,
          takenAt: takenAt.current,
          parts: answers,
        },
      });
    } catch {
      setSaved({ kind: 'error', message: 'Résultat non gardé : réessayez.' });
      setSaving(false);
      return;
    }
    setDone((all) => new Set(all).add(learnerId));
    const outcome = await syncActions();
    if (outcome.kind === 'done' && outcome.rejected.length > 0) {
      setSaved({ kind: 'error', message: outcome.rejected.join(' ') });
    } else if (outcome.kind === 'done') {
      setSaved({ kind: 'sent', message: 'Résultat enregistré.' });
    } else if (outcome.kind === 'login') {
      setSaved({
        kind: 'login',
        message: 'Reconnectez-vous : le résultat reste gardé sur cet appareil et partira ensuite.',
      });
    } else {
      setSaved({
        kind: 'kept',
        message:
          'Pas de connexion : le résultat est gardé sur cet appareil et partira au retour d’internet.',
      });
    }
    setSaving(false);
  }

  if (!learner) {
    return (
      <div className="space-y-4" data-testid="oral-learners">
        <p className="text-ink-muted">
          Choisissez l’élève. Gardez cette page ouverte : sans connexion, vous pouvez continuer et
          les résultats partiront au retour d’internet.
        </p>
        {sheet.learners.length === 0 ? (
          <p className="rounded-big border border-line bg-surface p-5">
            Aucun élève dans cette classe.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {sheet.learners.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => begin(l.id)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 text-left font-bold hover:border-primary"
                  data-testid="oral-learner"
                >
                  {l.name}
                  {done.has(l.id) && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-sm text-primary">
                      Passé
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (phase === 'summary') {
    const scores = test.parts.map((p, i) => scoreOralPart(p, answers[i] ?? blank()));
    return (
      <div className="space-y-5" data-testid="oral-summary">
        <h2 className="font-display text-2xl font-bold">{learner.name} : résultat</h2>
        <ul className="divide-y divide-line rounded-big border border-line bg-surface px-5">
          {test.parts.map((p, i) => {
            const s = scores[i]!;
            return (
              <li key={i} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex-1 font-bold">{p.title}</span>
                <span>
                  {s.perMinute !== null
                    ? `${s.perMinute} juste${s.perMinute > 1 ? 's' : ''} par minute (${s.correct}/${s.total})`
                    : `${s.correct} / ${s.total} juste${s.correct > 1 ? 's' : ''}`}
                  {s.questionsCorrect !== null &&
                    ` · questions ${s.questionsCorrect}/${p.questions.length}`}
                  {s.stopped && ' · arrêtée'}
                </span>
              </li>
            );
          })}
        </ul>
        {saved ? (
          <div className="space-y-3">
            <p
              role={saved.kind === 'error' ? 'alert' : 'status'}
              className={`rounded-card border p-4 font-bold ${saved.kind === 'error' ? 'border-error text-error' : 'border-line-strong'}`}
              data-testid="oral-saved"
            >
              {saved.message}
            </p>
            <button type="button" className={buttonClass} onClick={() => setLearnerId(null)}>
              Élève suivant
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => void save()}
              disabled={saving}
              data-testid="oral-save"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer le résultat'}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setLearnerId(null)}
            >
              Annuler cette passation
            </button>
          </div>
        )}
      </div>
    );
  }

  const first = Math.min(ORAL_STOP_RULE, items.length);
  const stopRule =
    phase === 'running' &&
    first > 0 &&
    Array.from({ length: first }, (_, i) => i).every((i) => answer.errors.includes(i));

  return (
    <div className="space-y-5" data-testid="oral-part-run">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink-muted">
            {learner.name} · partie {index + 1} sur {test.parts.length}
          </p>
          <h2 className="font-display text-2xl font-bold">{part.title}</h2>
        </div>
        {(phase === 'running' || phase === 'last') && part.kind !== 'questions' && (
          <p
            className={`rounded-card px-4 py-2 font-display text-3xl font-extrabold tabular-nums ${
              phase === 'running' && remaining <= 10
                ? 'bg-accent-soft'
                : 'bg-primary-soft text-primary'
            }`}
            aria-live="off"
            data-testid="oral-clock"
          >
            {phase === 'running' ? clock(remaining) : 'Fini'}
          </p>
        )}
      </div>

      {phase === 'intro' && (
        <div className="space-y-4 rounded-big border border-line bg-surface p-5">
          {part.instruction && <p className="text-lg">Dites à l’élève : « {part.instruction} »</p>}
          <p className="text-sm text-ink-muted">
            {part.kind === 'questions'
              ? 'Posez chaque question à voix haute et touchez Juste ou Faux.'
              : `Quand l’élève commence, lancez le chronomètre (${part.seconds} s). Touchez chaque élément faux ou sauté. Si l’élève se corrige tout seul, touchez à nouveau : c’est juste.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={start} data-testid="oral-start">
              {part.kind === 'questions' ? 'Commencer' : `Démarrer le chronomètre`}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                update({ stopped: true });
                next();
              }}
            >
              Ne pas passer cette partie
            </button>
          </div>
        </div>
      )}

      {(phase === 'running' || phase === 'last') && (
        <>
          {phase === 'last' && (
            <p
              role="status"
              className="rounded-card border-2 border-primary bg-surface p-4 font-bold"
            >
              Touchez le dernier élément que l’élève a lu, puis validez.
            </p>
          )}
          {stopRule && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-card border-2 border-error bg-surface p-4"
            >
              <p className="flex-1 font-bold">
                Les {first} premiers sont faux : arrêtez la partie (règle d’arrêt), elle compte 0.
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={stopPart}
                data-testid="oral-stop"
              >
                Arrêter la partie
              </button>
            </div>
          )}
          <div
            className={
              part.kind === 'grille'
                ? 'grid grid-cols-5 gap-2 sm:grid-cols-10'
                : 'flex flex-wrap gap-x-1 gap-y-2 rounded-big border border-line bg-surface p-4'
            }
            data-testid="oral-grid"
          >
            {items.map((item, i) => {
              const wrong = answer.errors.includes(i);
              const isLast = phase === 'last' && answer.last === i;
              const after = phase === 'last' && answer.last !== null && i > answer.last;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => tap(i)}
                  aria-pressed={phase === 'running' ? wrong : isLast}
                  aria-label={`${item}${wrong ? ', faux' : ''}${isLast ? ', dernier lu' : ''}`}
                  className={`min-h-[48px] rounded-card border-2 px-2 font-display text-xl font-bold ${
                    wrong
                      ? 'border-error bg-surface text-error line-through'
                      : 'border-line bg-surface'
                  } ${isLast ? 'ring-4 ring-primary' : ''} ${after ? 'opacity-40' : ''} ${
                    part.kind === 'texte' ? 'min-w-0' : ''
                  }`}
                  data-testid="oral-item"
                >
                  {item}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {phase === 'running' ? (
              <>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={finishEarly}
                  data-testid="oral-finish"
                >
                  L’élève a fini avant la fin
                </button>
                <button type="button" className={secondaryButtonClass} onClick={stopPart}>
                  Arrêter la partie
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={confirmLast}
                  disabled={answer.last === null}
                  data-testid="oral-last"
                >
                  Valider le dernier lu
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => {
                    update({ last: null, stopped: true });
                    next();
                  }}
                >
                  L’élève n’a rien lu
                </button>
              </>
            )}
          </div>
        </>
      )}

      {phase === 'questions' && (
        <div className="space-y-3">
          <ol className="space-y-3">
            {part.questions.map((q, k) => {
              const value = answer.answers[k] ?? null;
              const set = (v: 0 | 1 | null) => {
                const list = part.questions.map((_, m) => answer.answers[m] ?? null);
                list[k] = v;
                update({ answers: list });
              };
              return (
                <li
                  key={k}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4"
                >
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="font-bold">
                      {k + 1}. {q.prompt}
                    </p>
                    {q.answer && <p className="text-sm text-ink-muted">Attendu : {q.answer}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-pressed={value === 1}
                      onClick={() => set(value === 1 ? null : 1)}
                      className={`min-h-[44px] rounded-card border-2 px-4 font-bold ${value === 1 ? 'border-primary bg-primary text-surface' : 'border-line'}`}
                      data-testid="oral-q-right"
                    >
                      Juste
                    </button>
                    <button
                      type="button"
                      aria-pressed={value === 0}
                      onClick={() => set(value === 0 ? null : 0)}
                      className={`min-h-[44px] rounded-card border-2 px-4 font-bold ${value === 0 ? 'border-error bg-surface text-error' : 'border-line'}`}
                      data-testid="oral-q-wrong"
                    >
                      Faux
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <button type="button" className={buttonClass} onClick={next} data-testid="oral-next">
            {index + 1 < test.parts.length ? 'Partie suivante' : 'Voir le résultat'}
          </button>
        </div>
      )}
    </div>
  );
}
