'use client';

import {
  WORKSHOP_STEP_KINDS,
  WORKSHOP_STEP_KIND_HINTS,
  WORKSHOP_STEP_KIND_LABELS,
  WORKSHOP_TRADES,
  WORKSHOP_TRADE_LABELS,
  type UpdateWorkshopInput,
  type WorkshopCompetencyOption,
  type WorkshopStepInput,
  type WorkshopStepKind,
} from '@lenseignement/types';
import { useState } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from './Notice';

const small =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card border border-line-strong bg-surface px-3 font-bold text-ink hover:bg-primary-soft disabled:opacity-40';

function blank(kind: WorkshopStepKind): WorkshopStepInput {
  if (kind === 'identify') {
    return {
      kind,
      title: '',
      instructions: '',
      questions: [{ prompt: '', choices: ['', ''], correct: 0, explanation: '' }],
    };
  }
  if (kind === 'equipment') {
    return {
      kind,
      title: '',
      instructions: '',
      options: [
        { label: '', needed: true, explanation: '' },
        { label: '', needed: false, explanation: '' },
      ],
    };
  }
  return {
    kind,
    title: '',
    instructions: '',
    gestures: [
      { label: '', explanation: '' },
      { label: '', explanation: '' },
    ],
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

const without = <T,>(list: T[], i: number) => list.filter((_, k) => k !== i);

/**
 * Éditeur d'un atelier : la fiche et les étapes, modifiées dans la page, puis envoyées en une
 * fois (champ `payload`) à l'action serveur ; l'API vérifie tout.
 */
export function WorkshopEditor({
  id,
  initial,
  competencies,
  action,
}: {
  id: string;
  initial: UpdateWorkshopInput;
  competencies: WorkshopCompetencyOption[];
  action: (form: FormData) => Promise<void>;
}) {
  const [data, setData] = useState<UpdateWorkshopInput>(initial);
  const set = (patch: Partial<UpdateWorkshopInput>) => setData((d) => ({ ...d, ...patch }));
  const setStep = (i: number, step: WorkshopStepInput) =>
    set({ steps: data.steps.map((s, k) => (k === i ? step : s)) });

  return (
    <form action={action} className="space-y-6" data-testid="workshop-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payload" value={JSON.stringify(data)} />

      <fieldset className="space-y-4 rounded-big border border-line bg-surface p-5">
        <legend className="px-1 font-display text-xl font-bold">Fiche de l’atelier</legend>
        <label className="block font-bold">
          Titre
          <input
            value={data.title}
            onChange={(e) => set({ title: e.target.value })}
            required
            maxLength={120}
            className={inputClass}
          />
        </label>
        <label className="block font-bold">
          Métier
          <select
            value={data.trade}
            onChange={(e) => set({ trade: e.target.value as UpdateWorkshopInput['trade'] })}
            className={inputClass}
          >
            {WORKSHOP_TRADES.map((t) => (
              <option key={t} value={t}>
                {WORKSHOP_TRADE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-bold">
          Présentation courte (pour l’élève)
          <textarea
            value={data.summary}
            onChange={(e) => set({ summary: e.target.value })}
            maxLength={400}
            rows={2}
            className={inputClass}
          />
        </label>
        <label className="block font-bold">
          Compétence du programme (facultatif)
          <select
            value={data.competencyId ?? ''}
            onChange={(e) => set({ competencyId: e.target.value || null })}
            className={inputClass}
          >
            <option value="">Aucune</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.curriculum} · {c.code} {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[44px] items-center gap-3 font-bold">
          <input
            type="checkbox"
            checked={data.practice}
            onChange={(e) => set({ practice: e.target.checked })}
            className="h-5 w-5"
          />
          Après la réussite, l’élève demande une séance pratique avec le formateur
        </label>
      </fieldset>

      <ol className="space-y-4">
        {data.steps.map((step, i) => (
          <li key={i}>
            <fieldset
              className="space-y-3 rounded-big border border-line bg-surface p-5"
              data-testid="workshop-step"
            >
              <legend className="px-1 font-display text-lg font-bold">
                Étape {i + 1} · {WORKSHOP_STEP_KIND_LABELS[step.kind]}
              </legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={small}
                  disabled={i === 0}
                  onClick={() => set({ steps: move(data.steps, i, i - 1) })}
                  aria-label={`Monter l’étape ${i + 1}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={small}
                  disabled={i === data.steps.length - 1}
                  onClick={() => set({ steps: move(data.steps, i, i + 1) })}
                  aria-label={`Descendre l’étape ${i + 1}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={small}
                  onClick={() => set({ steps: without(data.steps, i) })}
                >
                  Retirer l’étape
                </button>
              </div>
              <label className="block font-bold">
                Titre de l’étape
                <input
                  value={step.title}
                  onChange={(e) => setStep(i, { ...step, title: e.target.value })}
                  required
                  maxLength={120}
                  className={inputClass}
                />
              </label>
              <label className="block font-bold">
                Consigne (facultatif)
                <input
                  value={step.instructions}
                  onChange={(e) => setStep(i, { ...step, instructions: e.target.value })}
                  maxLength={400}
                  className={inputClass}
                />
              </label>
              <StepBody step={step} n={i + 1} onChange={(s) => setStep(i, s)} />
            </fieldset>
          </li>
        ))}
      </ol>

      {data.steps.length < 10 && (
        <div className="space-y-2 rounded-big border border-dashed border-line-strong p-5">
          <p className="font-bold">Ajouter une étape</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {WORKSHOP_STEP_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => set({ steps: [...data.steps, blank(kind)] })}
                className="rounded-card border border-line bg-surface p-3 text-left hover:border-primary"
              >
                <span className="block font-bold">+ {WORKSHOP_STEP_KIND_LABELS[kind]}</span>
                <span className="text-sm text-ink-muted">{WORKSHOP_STEP_KIND_HINTS[kind]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="submit" className={buttonClass}>
        Enregistrer le brouillon
      </button>
    </form>
  );
}

function StepBody({
  step,
  n,
  onChange,
}: {
  step: WorkshopStepInput;
  n: number;
  onChange: (step: WorkshopStepInput) => void;
}) {
  if (step.kind === 'identify') {
    const setQ = (q: number, patch: Partial<(typeof step.questions)[number]>) =>
      onChange({
        ...step,
        questions: step.questions.map((x, k) => (k === q ? { ...x, ...patch } : x)),
      });
    return (
      <div className="space-y-4">
        {step.questions.map((question, q) => (
          <fieldset key={q} className="space-y-2 rounded-card border border-line p-4">
            <legend className="px-1 font-bold">Question {q + 1}</legend>
            <label className="block font-bold">
              Question
              <input
                value={question.prompt}
                onChange={(e) => setQ(q, { prompt: e.target.value })}
                required
                maxLength={300}
                className={inputClass}
              />
            </label>
            <p className="text-sm text-ink-muted">Cochez la bonne réponse.</p>
            {question.choices.map((choice, c) => (
              <div key={c} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`bonne-${n}-${q}`}
                  checked={question.correct === c}
                  onChange={() => setQ(q, { correct: c })}
                  aria-label={`Bonne réponse : réponse ${c + 1}`}
                  className="h-5 w-5 flex-none"
                />
                <input
                  value={choice}
                  onChange={(e) =>
                    setQ(q, {
                      choices: question.choices.map((x, k) => (k === c ? e.target.value : x)),
                    })
                  }
                  required
                  maxLength={200}
                  aria-label={`Réponse ${c + 1}`}
                  className={`${inputClass} mt-0`}
                />
                <button
                  type="button"
                  className={small}
                  disabled={question.choices.length <= 2}
                  aria-label={`Retirer la réponse ${c + 1}`}
                  onClick={() =>
                    setQ(q, {
                      choices: without(question.choices, c),
                      correct:
                        question.correct >= c && question.correct > 0
                          ? question.correct - 1
                          : question.correct,
                    })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            {question.choices.length < 6 && (
              <button
                type="button"
                className={small}
                onClick={() => setQ(q, { choices: [...question.choices, ''] })}
              >
                + Réponse
              </button>
            )}
            <label className="block font-bold">
              Explication montrée en cas d’erreur
              <input
                value={question.explanation}
                onChange={(e) => setQ(q, { explanation: e.target.value })}
                maxLength={400}
                className={inputClass}
              />
            </label>
            {step.questions.length > 1 && (
              <button
                type="button"
                className={small}
                onClick={() => onChange({ ...step, questions: without(step.questions, q) })}
              >
                Retirer la question
              </button>
            )}
          </fieldset>
        ))}
        {step.questions.length < 6 && (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              onChange({
                ...step,
                questions: [
                  ...step.questions,
                  { prompt: '', choices: ['', ''], correct: 0, explanation: '' },
                ],
              })
            }
          >
            + Question
          </button>
        )}
      </div>
    );
  }

  if (step.kind === 'equipment') {
    const setO = (o: number, patch: Partial<(typeof step.options)[number]>) =>
      onChange({
        ...step,
        options: step.options.map((x, k) => (k === o ? { ...x, ...patch } : x)),
      });
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Cochez « À prendre » pour ce qu’il faut emporter ; les autres sont des pièges.
        </p>
        {step.options.map((option, o) => (
          <div key={o} className="space-y-2 rounded-card border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={option.label}
                onChange={(e) => setO(o, { label: e.target.value })}
                required
                maxLength={160}
                aria-label={`Équipement ${o + 1}`}
                placeholder={`Équipement ${o + 1}`}
                className={`${inputClass} mt-0 flex-1 basis-48`}
              />
              <label className="flex min-h-[44px] items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={option.needed}
                  onChange={(e) => setO(o, { needed: e.target.checked })}
                  className="h-5 w-5"
                />
                À prendre
              </label>
              <button
                type="button"
                className={small}
                disabled={step.options.length <= 2}
                aria-label={`Retirer l’équipement ${o + 1}`}
                onClick={() => onChange({ ...step, options: without(step.options, o) })}
              >
                ✕
              </button>
            </div>
            <input
              value={option.explanation}
              onChange={(e) => setO(o, { explanation: e.target.value })}
              maxLength={300}
              aria-label={`Pourquoi (équipement ${o + 1})`}
              placeholder="Pourquoi le prendre ou le laisser"
              className={`${inputClass} mt-0`}
            />
          </div>
        ))}
        {step.options.length < 12 && (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              onChange({
                ...step,
                options: [...step.options, { label: '', needed: false, explanation: '' }],
              })
            }
          >
            + Équipement
          </button>
        )}
      </div>
    );
  }

  const setG = (g: number, patch: Partial<(typeof step.gestures)[number]>) =>
    onChange({
      ...step,
      gestures: step.gestures.map((x, k) => (k === g ? { ...x, ...patch } : x)),
    });
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Écrivez les gestes dans le BON ordre : l’élève les verra mélangés.
      </p>
      {step.gestures.map((gesture, g) => (
        <div key={g} className="space-y-2 rounded-card border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{g + 1}.</span>
            <input
              value={gesture.label}
              onChange={(e) => setG(g, { label: e.target.value })}
              required
              maxLength={200}
              aria-label={`Geste ${g + 1}`}
              placeholder={`Geste ${g + 1}`}
              className={`${inputClass} mt-0 flex-1 basis-48`}
            />
            <button
              type="button"
              className={small}
              disabled={g === 0}
              aria-label={`Monter le geste ${g + 1}`}
              onClick={() => onChange({ ...step, gestures: move(step.gestures, g, g - 1) })}
            >
              ↑
            </button>
            <button
              type="button"
              className={small}
              disabled={step.gestures.length <= 2}
              aria-label={`Retirer le geste ${g + 1}`}
              onClick={() => onChange({ ...step, gestures: without(step.gestures, g) })}
            >
              ✕
            </button>
          </div>
          <input
            value={gesture.explanation}
            onChange={(e) => setG(g, { explanation: e.target.value })}
            maxLength={300}
            aria-label={`Pourquoi à cette place (geste ${g + 1})`}
            placeholder="Pourquoi ce geste vient à cette place"
            className={`${inputClass} mt-0`}
          />
        </div>
      ))}
      {step.gestures.length < 8 && (
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() =>
            onChange({ ...step, gestures: [...step.gestures, { label: '', explanation: '' }] })
          }
        >
          + Geste
        </button>
      )}
    </div>
  );
}
