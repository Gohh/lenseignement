'use client';

import type {
  ExerciseAnswer,
  ExerciseMedia,
  ExercisePlay,
  ExerciseResult,
} from '@lenseignement/types';
import { useState, useTransition } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from './Notice';

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);
const radio = 'flex min-h-[44px] items-center gap-3 text-lg';

/** Image ou son de l'exercice. */
export function ExerciseMediaView({ media }: { media: ExerciseMedia }) {
  const src = `/exercices/fichiers/${media.key}`;
  if (media.type === 'audio') {
    return (
      <audio controls preload="none" src={src} className="w-full">
        {media.alt}
      </audio>
    );
  }
  return <img src={src} alt={media.alt} className="max-h-80 rounded-card border border-line" />;
}

function Choices({
  name,
  choices,
  value,
  onChange,
}: {
  name: string;
  choices: string[];
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      {choices.map((choice, c) => (
        <label key={c} className={radio}>
          <input
            type="radio"
            name={name}
            checked={value === c}
            onChange={() => onChange(c)}
            className="h-5 w-5"
          />
          {choice}
        </label>
      ))}
    </div>
  );
}

/**
 * Champs de réponse d'un exercice (sans corrigé). La réponse est tenue par le parent : un seul
 * exercice (aperçu) ou tout un devoir.
 */
export function ExerciseInputs({
  play,
  answer,
  onChange,
  name,
}: {
  play: ExercisePlay;
  answer: ExerciseAnswer;
  onChange: (answer: ExerciseAnswer) => void;
  /** Préfixe des boutons radio, unique dans la page. */
  name: string;
}) {
  const { choices, texts } = answer;
  const pick = (i: number, v: number) => {
    const next = [...choices];
    while (next.length <= i) next.push(-1);
    next[i] = v;
    onChange({ choices: next, texts });
  };
  const write = (i: number, v: string) => {
    const next = [...texts];
    while (next.length <= i) next.push('');
    next[i] = v;
    onChange({ choices, texts: next });
  };

  return (
    <div className="space-y-4">
      {play.kind !== 'gaps' && <p className="text-lg font-bold">{play.prompt}</p>}
      {play.media && <ExerciseMediaView media={play.media} />}

      {(play.kind === 'choice' || play.kind === 'media') && (
        <Choices
          name={`${name}-0`}
          choices={play.choices}
          value={choices[0]}
          onChange={(v) => pick(0, v)}
        />
      )}
      {play.kind === 'truefalse' && (
        <Choices
          name={`${name}-0`}
          choices={['Vrai', 'Faux']}
          value={choices[0]}
          onChange={(v) => pick(0, v)}
        />
      )}
      {play.kind === 'gaps' && (
        <>
          <p className="text-lg font-bold">Complète.</p>
          <p className="text-lg leading-loose">
            {play.parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < play.parts.length - 1 && (
                  <input
                    aria-label={`Trou n° ${i + 1}`}
                    value={texts[i] ?? ''}
                    onChange={(e) => write(i, e.target.value)}
                    maxLength={200}
                    className="mx-1 inline-block w-36 rounded-card border-2 border-line-strong bg-surface px-2 py-1"
                  />
                )}
              </span>
            ))}
          </p>
          <p className="text-ink-muted">{play.prompt}</p>
        </>
      )}
      {play.kind === 'match' &&
        play.lefts.map((left, i) => (
          <label key={i} className="block font-bold">
            {left}
            <select
              value={choices[i] ?? -1}
              onChange={(e) => pick(i, Number(e.target.value))}
              className={inputClass}
            >
              <option value={-1}>Choisir…</option>
              {play.rights.map((right, r) => (
                <option key={r} value={r}>
                  {right}
                </option>
              ))}
            </select>
          </label>
        ))}
      {play.kind === 'order' &&
        play.items.map((_, place) => (
          <label key={place} className="block font-bold">
            {ordinal(place + 1)}
            <select
              value={choices[place] ?? -1}
              onChange={(e) => pick(place, Number(e.target.value))}
              className={inputClass}
            >
              <option value={-1}>Choisir…</option>
              {play.items.map((item, d) => (
                <option key={d} value={d}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ))}
      {play.kind === 'number' && (
        <label className="block font-bold">
          Ta réponse
          <span className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={texts[0] ?? ''}
              onChange={(e) => write(0, e.target.value)}
              maxLength={40}
              className={`${inputClass} max-w-[12rem]`}
            />
            {play.unit && <span>{play.unit}</span>}
          </span>
        </label>
      )}
      {play.kind === 'table' && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[16rem] border-collapse text-left">
              <thead>
                <tr>
                  {play.table.header.map((h, i) => (
                    <th key={i} className="border border-line-strong bg-primary-soft px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {play.table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className="border border-line-strong px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Choices
            name={`${name}-0`}
            choices={play.choices}
            value={choices[0]}
            onChange={(v) => pick(0, v)}
          />
        </>
      )}
      {play.kind === 'reading' && (
        <>
          <div className="whitespace-pre-line rounded-card border border-line bg-background p-4 text-lg">
            {play.passage}
          </div>
          {play.questions.map((q, i) => (
            <fieldset key={i} className="space-y-1">
              <legend className="font-bold">
                {i + 1}. {q.prompt}
              </legend>
              <Choices
                name={`${name}-${i}`}
                choices={q.choices}
                value={choices[i]}
                onChange={(v) => pick(i, v)}
              />
            </fieldset>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Un exercice tel que l'élève le voit (sans corrigé). La réponse est corrigée par la plateforme
 * (`check`), jamais dans le navigateur.
 */
export function ExercisePlayer({
  play,
  check,
}: {
  play: ExercisePlay;
  check: (answer: ExerciseAnswer) => Promise<ExerciseResult | { error: string }>;
}) {
  const [answer, setAnswer] = useState<ExerciseAnswer>({ choices: [], texts: [] });
  const [result, setResult] = useState<ExerciseResult | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const reset = () => {
    setAnswer({ choices: [], texts: [] });
    setResult(null);
  };

  return (
    <form
      className="space-y-4"
      data-testid="exercise-player"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => setResult(await check(answer)));
      }}
    >
      <ExerciseInputs play={play} answer={answer} onChange={setAnswer} name="apercu" />

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? 'Correction…' : 'Vérifier'}
        </button>
        {result && (
          <button type="button" className={secondaryButtonClass} onClick={reset}>
            Recommencer
          </button>
        )}
      </div>

      {result && 'error' in result && (
        <p role="alert" className="font-bold text-error">
          {result.error}
        </p>
      )}
      {result && !('error' in result) && (
        <div
          role="status"
          className={`space-y-1 rounded-card border-2 p-4 ${result.correct ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface'}`}
          data-testid="exercise-result"
        >
          <p className="font-bold">
            {result.correct
              ? '✓ Bonne réponse'
              : `À revoir · ${Math.round(result.score * 100)} % des points`}
          </p>
          {result.feedback.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </form>
  );
}
