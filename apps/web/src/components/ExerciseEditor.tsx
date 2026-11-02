'use client';

import {
  EXERCISE_DIFFICULTIES,
  EXERCISE_DIFFICULTY_LABELS,
  EXERCISE_DOMAINS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KIND_LABELS,
  EXERCISE_MEDIA_MAX_BYTES,
  EXERCISE_SKILLS,
  EXERCISE_SKILL_LABELS,
  parseNumber,
  type ExerciseCompetencyOption,
  type ExerciseContent,
  type ExerciseMedia,
  type UpdateExerciseInput,
} from '@lenseignement/types';
import { useState, type ChangeEvent } from 'react';
import { ExerciseMediaView } from './ExercisePlayer';
import { buttonClass, inputClass } from './Notice';

const small =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card border border-line-strong bg-surface px-3 font-bold text-ink hover:bg-primary-soft disabled:opacity-40';
const box = 'space-y-4 rounded-big border border-line bg-surface p-5';
const legend = 'px-1 font-display text-xl font-bold';

const without = <T,>(list: T[], i: number) => list.filter((_, k) => k !== i);
const replace = <T,>(list: T[], i: number, value: T) => list.map((v, k) => (k === i ? value : v));

/** Réponses proposées, avec la bonne cochée. */
function ChoiceList({
  label,
  choices,
  correct,
  onChange,
}: {
  label: string;
  choices: string[];
  correct: number;
  onChange: (choices: string[], correct: number) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-bold">{label} (cochez la bonne)</legend>
      {choices.map((choice, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            checked={correct === i}
            onChange={() => onChange(choices, i)}
            aria-label={`Réponse ${i + 1} : la bonne`}
            className="h-5 w-5 shrink-0"
          />
          <input
            value={choice}
            onChange={(e) => onChange(replace(choices, i, e.target.value), correct)}
            aria-label={`Réponse ${i + 1}`}
            maxLength={200}
            className={`${inputClass} mt-0`}
          />
          <button
            type="button"
            className={small}
            disabled={choices.length <= 2}
            onClick={() =>
              onChange(without(choices, i), correct === i ? 0 : correct > i ? correct - 1 : correct)
            }
            aria-label={`Retirer la réponse ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      {choices.length < 6 && (
        <button type="button" className={small} onClick={() => onChange([...choices, ''], correct)}>
          + Ajouter une réponse
        </button>
      )}
    </fieldset>
  );
}

/** Liste simple de textes (éléments à remettre dans l'ordre). */
function TextList({
  items,
  max,
  onChange,
}: {
  items: string[];
  max: number;
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right font-bold">{i + 1}.</span>
          <input
            value={item}
            onChange={(e) => onChange(replace(items, i, e.target.value))}
            aria-label={`Élément ${i + 1}`}
            maxLength={200}
            className={`${inputClass} mt-0`}
          />
          <button
            type="button"
            className={small}
            disabled={items.length <= 2}
            onClick={() => onChange(without(items, i))}
            aria-label={`Retirer l’élément ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className={small} onClick={() => onChange([...items, ''])}>
          + Ajouter
        </button>
      )}
    </div>
  );
}

const tableText = (t: { header: string[]; rows: string[][] }) =>
  [t.header, ...t.rows].map((r) => r.join(' ; ')).join('\n');
const parseTable = (raw: string) => {
  const lines = raw
    .split('\n')
    .map((l) => l.split(';').map((c) => c.trim()))
    .filter((l) => l.some((c) => c));
  return { header: lines[0] ?? [''], rows: lines.slice(1) };
};

/** Image ou son : dépôt (vérifié par l'API), description, retrait. */
function MediaField({
  id,
  media,
  required,
  onChange,
}: {
  id: string;
  media: ExerciseMedia | null;
  required: boolean;
  onChange: (media: ExerciseMedia | null) => void;
}) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > EXERCISE_MEDIA_MAX_BYTES) {
      setState({ busy: false, error: 'Fichier trop lourd : 5 Mo au plus.' });
      return;
    }
    setState({ busy: true, error: null });
    try {
      const res = await fetch(`/mon-espace/fabrique/media/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as Partial<ExerciseMedia> & {
        message?: string;
      };
      if (!res.ok || !json.key || !json.type) {
        setState({ busy: false, error: json.message ?? 'Envoi impossible.' });
        return;
      }
      onChange({ key: json.key, type: json.type, alt: media?.alt ?? '' });
      setState({ busy: false, error: null });
    } catch {
      setState({ busy: false, error: 'Envoi impossible : vérifiez la connexion.' });
    }
  }

  return (
    <div className="space-y-2">
      <label className="block font-bold">
        {media ? 'Remplacer l’image ou le son' : `Image ou son${required ? '' : ' (facultatif)'}`}
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/ogg,audio/wav,audio/mp4"
          onChange={upload}
          disabled={state.busy}
          className={inputClass}
          data-testid="exercise-media-file"
        />
      </label>
      <p className="text-sm text-ink-muted">
        Photo, dessin (PNG, JPEG, WebP, GIF) ou son (MP3, OGG, WAV, M4A), 5 Mo au plus.
      </p>
      {state.busy && <p role="status">Envoi du fichier…</p>}
      {state.error && (
        <p role="alert" className="font-bold text-error">
          {state.error}
        </p>
      )}
      {media && (
        <div className="space-y-2">
          <ExerciseMediaView media={media} />
          <label className="block font-bold">
            {media.type === 'image'
              ? 'Ce que montre l’image (lu aux élèves qui ne la voient pas)'
              : 'Ce que dit le son (pour les élèves qui ne l’entendent pas)'}
            <input
              value={media.alt}
              onChange={(e) => onChange({ ...media, alt: e.target.value })}
              maxLength={200}
              className={inputClass}
            />
          </label>
          <button type="button" className={small} onClick={() => onChange(null)}>
            Retirer le fichier
          </button>
        </div>
      )}
    </div>
  );
}

/** Champs propres au type d'exercice, avec le corrigé. */
function KindFields({
  content,
  onChange,
}: {
  content: ExerciseContent;
  onChange: (content: ExerciseContent) => void;
}) {
  const [table, setTable] = useState(content.kind === 'table' ? tableText(content.table) : '');
  const [answer, setAnswer] = useState(
    content.kind === 'number' ? String(content.answer).replace('.', ',') : '',
  );
  const [tolerance, setTolerance] = useState(
    content.kind === 'number' ? String(content.tolerance).replace('.', ',') : '',
  );

  switch (content.kind) {
    case 'choice':
    case 'media':
      return (
        <ChoiceList
          label="Réponses proposées"
          choices={content.choices}
          correct={content.correct}
          onChange={(choices, correct) => onChange({ ...content, choices, correct })}
        />
      );
    case 'truefalse':
      return (
        <fieldset className="space-y-1">
          <legend className="font-bold">L’affirmation est…</legend>
          {[true, false].map((v) => (
            <label key={String(v)} className="flex min-h-[44px] items-center gap-3 text-lg">
              <input
                type="radio"
                checked={content.correct === v}
                onChange={() => onChange({ ...content, correct: v })}
                className="h-5 w-5"
              />
              {v ? 'Vraie' : 'Fausse'}
            </label>
          ))}
        </fieldset>
      );
    case 'gaps':
      return (
        <label className="block font-bold">
          Texte avec ses trous
          <textarea
            value={content.text}
            onChange={(e) => onChange({ ...content, text: e.target.value })}
            rows={4}
            maxLength={1500}
            className={inputClass}
          />
          <span className="mt-1 block text-sm font-normal text-ink-muted">
            Mettez chaque réponse entre doubles crochets : « Le [[chat]] boit du lait. » Plusieurs
            réponses acceptées : [[12|douze]]. Majuscules et accents ne comptent pas.
          </span>
        </label>
      );
    case 'match':
      return (
        <fieldset className="space-y-2">
          <legend className="font-bold">
            Paires à relier (l’élève verra la 2e colonne mélangée)
          </legend>
          {content.pairs.map((pair, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={pair.left}
                onChange={(e) =>
                  onChange({
                    ...content,
                    pairs: replace(content.pairs, i, { ...pair, left: e.target.value }),
                  })
                }
                aria-label={`Paire ${i + 1}, à gauche`}
                maxLength={160}
                className={`${inputClass} mt-0 min-w-0 flex-1 basis-40`}
              />
              <span aria-hidden="true">↔</span>
              <input
                value={pair.right}
                onChange={(e) =>
                  onChange({
                    ...content,
                    pairs: replace(content.pairs, i, { ...pair, right: e.target.value }),
                  })
                }
                aria-label={`Paire ${i + 1}, à droite`}
                maxLength={160}
                className={`${inputClass} mt-0 min-w-0 flex-1 basis-40`}
              />
              <button
                type="button"
                className={small}
                disabled={content.pairs.length <= 2}
                onClick={() => onChange({ ...content, pairs: without(content.pairs, i) })}
                aria-label={`Retirer la paire ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          {content.pairs.length < 8 && (
            <button
              type="button"
              className={small}
              onClick={() =>
                onChange({ ...content, pairs: [...content.pairs, { left: '', right: '' }] })
              }
            >
              + Ajouter une paire
            </button>
          )}
        </fieldset>
      );
    case 'order':
      return (
        <fieldset className="space-y-2">
          <legend className="font-bold">
            Éléments dans le BON ordre (l’élève les verra mélangés)
          </legend>
          <TextList
            items={content.items}
            max={8}
            onChange={(items) => onChange({ ...content, items })}
          />
        </fieldset>
      );
    case 'number':
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block font-bold">
            Bonne réponse
            <input
              inputMode="decimal"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                const n = parseNumber(e.target.value);
                if (n !== null) onChange({ ...content, answer: n });
              }}
              className={inputClass}
            />
          </label>
          <label className="block font-bold">
            Écart accepté
            <input
              inputMode="decimal"
              value={tolerance}
              onChange={(e) => {
                setTolerance(e.target.value);
                const n = parseNumber(e.target.value);
                if (n !== null && n >= 0) onChange({ ...content, tolerance: n });
              }}
              className={inputClass}
            />
          </label>
          <label className="block font-bold">
            Unité (facultatif)
            <input
              value={content.unit}
              onChange={(e) => onChange({ ...content, unit: e.target.value })}
              maxLength={40}
              placeholder="cm, F CFA, kg…"
              className={inputClass}
            />
          </label>
        </div>
      );
    case 'table':
      return (
        <>
          <label className="block font-bold">
            Tableau
            <textarea
              value={table}
              onChange={(e) => {
                setTable(e.target.value);
                onChange({ ...content, table: parseTable(e.target.value) });
              }}
              rows={5}
              className={`${inputClass} font-mono`}
            />
            <span className="mt-1 block text-sm font-normal text-ink-muted">
              Une ligne par rangée, la première pour les titres ; séparez les cases par « ; ».
              Exemple : « Jour ; Élèves présents ».
            </span>
          </label>
          <ChoiceList
            label="Réponses proposées"
            choices={content.choices}
            correct={content.correct}
            onChange={(choices, correct) => onChange({ ...content, choices, correct })}
          />
        </>
      );
    case 'reading':
      return (
        <>
          <label className="block font-bold">
            Texte à lire
            <textarea
              value={content.passage}
              onChange={(e) => onChange({ ...content, passage: e.target.value })}
              rows={8}
              maxLength={5000}
              className={inputClass}
            />
          </label>
          <ol className="space-y-4">
            {content.questions.map((q, i) => (
              <li key={i} className="space-y-2 rounded-card border border-line p-4">
                <label className="block font-bold">
                  Question {i + 1}
                  <input
                    value={q.prompt}
                    onChange={(e) =>
                      onChange({
                        ...content,
                        questions: replace(content.questions, i, { ...q, prompt: e.target.value }),
                      })
                    }
                    maxLength={400}
                    className={inputClass}
                  />
                </label>
                <ChoiceList
                  label="Réponses"
                  choices={q.choices}
                  correct={q.correct}
                  onChange={(choices, correct) =>
                    onChange({
                      ...content,
                      questions: replace(content.questions, i, { ...q, choices, correct }),
                    })
                  }
                />
                <button
                  type="button"
                  className={small}
                  disabled={content.questions.length <= 1}
                  onClick={() => onChange({ ...content, questions: without(content.questions, i) })}
                >
                  Retirer la question
                </button>
              </li>
            ))}
          </ol>
          {content.questions.length < 6 && (
            <button
              type="button"
              className={small}
              onClick={() =>
                onChange({
                  ...content,
                  questions: [...content.questions, { prompt: '', choices: ['', ''], correct: 0 }],
                })
              }
            >
              + Ajouter une question
            </button>
          )}
        </>
      );
  }
}

/**
 * Éditeur d'un exercice : la fiche, l'énoncé et le corrigé, envoyés en une fois (champ
 * `payload`) à l'action serveur ; l'API vérifie tout.
 */
export function ExerciseEditor({
  id,
  initial,
  competencies,
  action,
}: {
  id: string;
  initial: UpdateExerciseInput;
  competencies: ExerciseCompetencyOption[];
  action: (form: FormData) => Promise<void>;
}) {
  const [data, setData] = useState<UpdateExerciseInput>(initial);
  const set = (patch: Partial<UpdateExerciseInput>) => setData((d) => ({ ...d, ...patch }));
  const setContent = (content: ExerciseContent) => set({ content });
  const c = data.content;

  return (
    <form action={action} className="space-y-6" data-testid="exercise-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payload" value={JSON.stringify(data)} />

      <fieldset className={box}>
        <legend className={legend}>Fiche</legend>
        <label className="block font-bold">
          Titre (pour vous retrouver dans la banque)
          <input
            value={data.title}
            onChange={(e) => set({ title: e.target.value })}
            required
            maxLength={120}
            className={inputClass}
          />
        </label>
        <label className="block font-bold">
          Compétence du programme
          <select
            value={data.competencyId}
            onChange={(e) => set({ competencyId: e.target.value })}
            className={inputClass}
          >
            {competencies.map((o) => (
              <option key={o.id} value={o.id}>
                {o.curriculum} · {o.code} {o.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block font-bold">
            Domaine
            <select
              value={data.domain}
              onChange={(e) => set({ domain: e.target.value as UpdateExerciseInput['domain'] })}
              className={inputClass}
            >
              {EXERCISE_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {EXERCISE_DOMAIN_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Difficulté
            <select
              value={data.difficulty}
              onChange={(e) =>
                set({ difficulty: e.target.value as UpdateExerciseInput['difficulty'] })
              }
              className={inputClass}
            >
              {EXERCISE_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {EXERCISE_DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            L’élève doit
            <select
              value={data.skill}
              onChange={(e) => set({ skill: e.target.value as UpdateExerciseInput['skill'] })}
              className={inputClass}
            >
              {EXERCISE_SKILLS.map((s) => (
                <option key={s} value={s}>
                  {EXERCISE_SKILL_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className={box}>
        <legend className={legend}>{EXERCISE_KIND_LABELS[c.kind]}</legend>
        <label className="block font-bold">
          {c.kind === 'truefalse'
            ? 'Affirmation'
            : c.kind === 'gaps'
              ? 'Consigne'
              : 'Consigne ou question'}
          <textarea
            value={c.prompt}
            onChange={(e) => setContent({ ...c, prompt: e.target.value })}
            rows={2}
            maxLength={1000}
            className={inputClass}
            data-testid="exercise-prompt"
          />
        </label>
        <MediaField
          id={id}
          media={c.media}
          required={c.kind === 'media'}
          onChange={(media) => setContent({ ...c, media })}
        />
        <KindFields content={c} onChange={setContent} />
        <label className="block font-bold">
          Explication montrée après la réponse (facultatif)
          <textarea
            value={c.explanation}
            onChange={(e) => setContent({ ...c, explanation: e.target.value })}
            rows={2}
            maxLength={600}
            className={inputClass}
          />
        </label>
      </fieldset>

      <button type="submit" className={buttonClass}>
        Enregistrer le brouillon
      </button>
    </form>
  );
}
