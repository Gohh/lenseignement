'use client';

import {
  EXAM_MODEL_INFO,
  EXAM_MODELS,
  EXERCISE_DOMAINS,
  EXERCISE_DOMAIN_LABELS,
  type ExamModel,
  type ExerciseDomain,
} from '@lenseignement/types';
import { useState } from 'react';

const inputClass =
  'mt-1 block w-24 min-h-[44px] rounded-card border border-line-strong bg-surface px-3 py-2 text-ink';

/**
 * Choix du modèle d'épreuve : il remplit les parts par domaine, que l'auteur peut ajuster.
 * Sans JavaScript, les parts du modèle par défaut restent et se modifient à la main.
 */
export function ExamModelPicker({ initial = 'pasec-fin-maths' }: { initial?: ExamModel }) {
  const [model, setModel] = useState<ExamModel>(initial);
  const [shares, setShares] = useState<Partial<Record<ExerciseDomain, number>>>(
    EXAM_MODEL_INFO[initial].shares,
  );
  const total = Object.values(shares).reduce((a, b) => a + (b ?? 0), 0);
  const pick = (m: ExamModel) => {
    setModel(m);
    setShares(EXAM_MODEL_INFO[m].shares);
  };
  const shown = EXERCISE_DOMAINS.filter(
    (d) => model === 'libre' || (EXAM_MODEL_INFO[model].shares[d] ?? 0) > 0 || (shares[d] ?? 0) > 0,
  );

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {EXAM_MODELS.map((m) => (
          <label
            key={m}
            className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-card border border-line-strong p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
          >
            <input
              type="radio"
              name="model"
              value={m}
              checked={model === m}
              onChange={() => pick(m)}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="block font-bold">{EXAM_MODEL_INFO[m].label}</span>
              <span className="block text-sm text-ink-muted">{EXAM_MODEL_INFO[m].hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="space-y-2" data-testid="exam-shares">
        <p className="font-bold">Part de chaque domaine (en %)</p>
        <div className="flex flex-wrap gap-4">
          {shown.map((d) => (
            <label key={d} className="block text-sm font-bold">
              {EXERCISE_DOMAIN_LABELS[d]}
              <input
                type="number"
                name={`share-${d}`}
                min={0}
                max={100}
                value={shares[d] ?? 0}
                onChange={(e) =>
                  setShares({ ...shares, [d]: Math.max(0, Number(e.target.value) || 0) })
                }
                className={inputClass}
              />
            </label>
          ))}
        </div>
        <p className={`text-sm ${total > 100 ? 'font-bold text-error' : 'text-ink-muted'}`}>
          Total : {total} %{total > 100 ? ' : il ne doit pas dépasser 100 %.' : ''} Les questions se
          répartissent selon ces parts.
        </p>
      </div>
    </>
  );
}
