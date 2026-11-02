'use client';

import {
  LEVEL_GROUPS,
  ORAL_PART_KIND_LABELS,
  ORAL_PART_KINDS,
  ORAL_SUBJECT_LABELS,
  ORAL_SUBJECTS,
  oralWords,
  type OralPart,
  type OralPartKind,
  type OralTestDetail,
} from '@lenseignement/types';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveOralTestAction } from '@/app/mon-espace/oral/actions';
import { buttonClass, inputClass, secondaryButtonClass } from './Notice';

const emptyPart = (kind: OralPartKind): OralPart => ({
  kind,
  title: kind === 'questions' ? 'Questions' : kind === 'texte' ? 'Petit texte' : 'Nouvelle partie',
  instruction: '',
  items: [],
  text: '',
  questions: kind === 'grille' ? [] : [{ prompt: '', answer: '' }],
  seconds: 60,
  reference: false,
});

/** Éditeur d'un brouillon : les parties, leurs éléments, le texte et les questions. */
export function OralEditor({
  test,
  organizations,
}: {
  test: OralTestDetail;
  organizations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(test.title);
  const [organizationId, setOrganizationId] = useState(test.organization.id);
  const [subject, setSubject] = useState<string>(test.subject);
  const [level, setLevel] = useState<string>(test.level);
  const [parts, setParts] = useState<OralPart[]>(test.parts);
  const [itemsText, setItemsText] = useState<string[]>(test.parts.map((p) => p.items.join('\n')));
  const [state, setState] = useState<{ kind: 'idle' | 'saved' | 'error'; message?: string }>({
    kind: 'idle',
  });
  const [pending, start] = useTransition();
  const orgs = organizations.some((o) => o.id === test.organization.id)
    ? organizations
    : [test.organization, ...organizations];

  const change = (i: number, patch: Partial<OralPart>) =>
    setParts((all) => all.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= parts.length) return;
    const swap = <T,>(list: T[]) => {
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    };
    setParts(swap);
    setItemsText(swap);
  };

  function save() {
    const ready = parts.map((p, i) => ({
      ...p,
      items:
        p.kind === 'grille'
          ? itemsText[i]!.split('\n')
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
    }));
    start(async () => {
      const result = await saveOralTestAction(test.id, {
        organizationId,
        title,
        subject,
        level,
        parts: ready,
      });
      if (result.ok) {
        setState({ kind: 'saved', message: 'Brouillon enregistré.' });
        router.refresh();
      } else setState({ kind: 'error', message: result.message });
    });
  }

  return (
    <div className="space-y-6" data-testid="oral-editor">
      <fieldset className="space-y-4 rounded-big border border-line bg-surface p-5">
        <legend className="px-1 font-display text-xl font-bold">L’épreuve</legend>
        <label className="block font-bold">
          Titre
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className={inputClass}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block font-bold">
            Structure
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={inputClass}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Matière
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            >
              {ORAL_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {ORAL_SUBJECT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Niveau
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
              {LEVEL_GROUPS.map((group) => (
                <optgroup key={group.code} label={group.title}>
                  {group.levels.map((l) => (
                    <option key={l.code} value={l.code}>
                      {group.title} {l.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      {parts.map((part, i) => {
        const words = part.kind === 'texte' ? oralWords(part.text).length : 0;
        const count =
          part.kind === 'grille' ? itemsText[i]!.split('\n').filter((x) => x.trim()).length : 0;
        return (
          <fieldset
            key={i}
            className="space-y-4 rounded-big border border-line bg-surface p-5"
            data-testid="oral-part"
          >
            <legend className="px-1 font-display text-xl font-bold">
              Partie {i + 1} · {part.title}
            </legend>
            <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
              <label className="block font-bold">
                Titre de la partie
                <input
                  value={part.title}
                  onChange={(e) => change(i, { title: e.target.value })}
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <label className="block font-bold">
                Type
                <select
                  value={part.kind}
                  onChange={(e) => {
                    const kind = e.target.value as OralPartKind;
                    change(i, {
                      kind,
                      questions:
                        kind !== 'grille' && part.questions.length === 0
                          ? [{ prompt: '', answer: '' }]
                          : part.questions,
                    });
                  }}
                  className={inputClass}
                >
                  {ORAL_PART_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ORAL_PART_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {part.kind !== 'questions' && (
                <label className="block font-bold">
                  Durée (secondes)
                  <input
                    type="number"
                    min={15}
                    max={300}
                    value={part.seconds}
                    onChange={(e) => change(i, { seconds: Number(e.target.value) || 60 })}
                    className={inputClass}
                  />
                </label>
              )}
            </div>
            <label className="block font-bold">
              Consigne lue à l’élève
              <textarea
                value={part.instruction}
                onChange={(e) => change(i, { instruction: e.target.value })}
                rows={2}
                maxLength={600}
                className={inputClass}
              />
            </label>
            {part.kind === 'grille' && (
              <label className="block font-bold">
                Éléments à lire, un par ligne ({count})
                <textarea
                  value={itemsText[i]}
                  onChange={(e) =>
                    setItemsText((all) => all.map((t, j) => (j === i ? e.target.value : t)))
                  }
                  rows={8}
                  className={`${inputClass} font-mono`}
                  name={`items-${i}`}
                />
                <span className="block text-sm font-normal text-ink-muted">
                  Lettres, sons, mots, nombres ou calculs. Au moins 5, au plus 150.
                </span>
              </label>
            )}
            {part.kind === 'texte' && (
              <label className="block font-bold">
                Texte lu par l’élève ({words} mots)
                <textarea
                  value={part.text}
                  onChange={(e) => change(i, { text: e.target.value })}
                  rows={5}
                  maxLength={3000}
                  className={inputClass}
                />
              </label>
            )}
            {part.kind !== 'grille' && (
              <div className="space-y-2">
                <p className="font-bold">
                  Questions {part.kind === 'texte' ? 'après la lecture' : ''}
                </p>
                {part.questions.map((q, k) => (
                  <div key={k} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                    <input
                      value={q.prompt}
                      onChange={(e) =>
                        change(i, {
                          questions: part.questions.map((x, m) =>
                            m === k ? { ...x, prompt: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder="Question"
                      aria-label={`Question ${k + 1}`}
                      className={inputClass}
                    />
                    <input
                      value={q.answer}
                      onChange={(e) =>
                        change(i, {
                          questions: part.questions.map((x, m) =>
                            m === k ? { ...x, answer: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder="Réponse attendue"
                      aria-label={`Réponse attendue ${k + 1}`}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      className="min-h-[44px] px-3 underline"
                      onClick={() =>
                        change(i, { questions: part.questions.filter((_, m) => m !== k) })
                      }
                    >
                      Retirer
                    </button>
                  </div>
                ))}
                {part.questions.length < 20 && (
                  <button
                    type="button"
                    className="min-h-[44px] underline"
                    onClick={() =>
                      change(i, { questions: [...part.questions, { prompt: '', answer: '' }] })
                    }
                  >
                    + Ajouter une question
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              {part.kind !== 'questions' && (
                <label className="flex min-h-[44px] items-center gap-2">
                  <input
                    type="radio"
                    name="reference"
                    checked={part.reference}
                    onChange={() =>
                      setParts((all) => all.map((p, j) => ({ ...p, reference: j === i })))
                    }
                  />
                  Partie du repère (score par minute suivi)
                </label>
              )}
              <span className="flex-1" />
              <button
                type="button"
                className="min-h-[44px] px-2 underline"
                onClick={() => move(i, -1)}
              >
                Monter
              </button>
              <button
                type="button"
                className="min-h-[44px] px-2 underline"
                onClick={() => move(i, 1)}
              >
                Descendre
              </button>
              {parts.length > 1 && (
                <button
                  type="button"
                  className="min-h-[44px] px-2 text-error underline"
                  onClick={() => {
                    setParts((all) => all.filter((_, j) => j !== i));
                    setItemsText((all) => all.filter((_, j) => j !== i));
                  }}
                >
                  Retirer la partie
                </button>
              )}
            </div>
          </fieldset>
        );
      })}

      {parts.length < 8 && (
        <div className="flex flex-wrap gap-2">
          {ORAL_PART_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                setParts((all) => [...all, emptyPart(k)]);
                setItemsText((all) => [...all, '']);
              }}
            >
              + {k === 'grille' ? 'Grille' : k === 'texte' ? 'Texte' : 'Questions'}
            </button>
          ))}
        </div>
      )}

      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-big border border-line bg-surface p-3 shadow">
        <button type="button" onClick={save} disabled={pending} className={buttonClass}>
          {pending ? 'Enregistrement…' : 'Enregistrer le brouillon'}
        </button>
        {state.kind !== 'idle' && (
          <p
            role={state.kind === 'error' ? 'alert' : 'status'}
            className={`font-bold ${state.kind === 'error' ? 'text-error' : ''}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
