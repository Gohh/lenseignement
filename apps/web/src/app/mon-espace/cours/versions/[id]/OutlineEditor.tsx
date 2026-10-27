'use client';

import type { CourseVersionDetail } from '@lenseignement/types';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import { saveOutlineAction } from '../../actions';

type Modules = CourseVersionDetail['modules'];
type Quiz = Modules[number]['lessons'][number]['quiz'];

const emptyQuestion = (): Quiz[number] => ({
  prompt: '',
  choices: ['', ''],
  correct: 0,
  explanation: '',
});

/** Éditeur du plan d'un brouillon : modules et leçons, enregistrés d'un bloc. */
export function OutlineEditor({
  versionId,
  revision,
  initial,
}: {
  versionId: string;
  revision: number;
  initial: Modules;
}) {
  const router = useRouter();
  const [modules, setModules] = useState<Modules>(initial);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (fn: (draft: Modules) => void) =>
    setModules((current) => {
      const copy = structuredClone(current);
      fn(copy);
      return copy;
    });

  const save = () =>
    startTransition(async () => {
      const result = await saveOutlineAction(versionId, { revision, modules });
      setStatus(result);
      // Recharge la page : nouvelle révision pour les formulaires suivants.
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      {modules.map((module, m) => (
        <fieldset key={m} className="space-y-3 rounded-card border border-line bg-surface p-4">
          <legend className="px-1 font-bold">Module {m + 1}</legend>
          <label className="block font-bold">
            Titre du module {m + 1}
            <input
              className={inputClass}
              value={module.title}
              onChange={(e) => update((d) => void (d[m]!.title = e.target.value))}
            />
          </label>
          {module.lessons.map((lesson, l) => (
            <div key={l} className="space-y-2 border-l-4 border-line pl-3">
              <label className="block font-bold">
                Leçon {m + 1}.{l + 1} : titre
                <input
                  className={inputClass}
                  value={lesson.title}
                  onChange={(e) => update((d) => void (d[m]!.lessons[l]!.title = e.target.value))}
                />
              </label>
              <label className="block font-bold">
                Leçon {m + 1}.{l + 1} : contenu
                <textarea
                  className={inputClass}
                  rows={3}
                  value={lesson.body}
                  onChange={(e) => update((d) => void (d[m]!.lessons[l]!.body = e.target.value))}
                />
              </label>
              <QuizEditor
                label={`Leçon ${m + 1}.${l + 1}`}
                quiz={lesson.quiz}
                onChange={(fn) => update((d) => fn(d[m]!.lessons[l]!.quiz))}
              />
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => update((d) => void d[m]!.lessons.splice(l, 1))}
              >
                Retirer la leçon {m + 1}.{l + 1}
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() =>
                update(
                  (d) =>
                    void d[m]!.lessons.push({
                      title: '',
                      body: '',
                      estimatedMinutes: null,
                      quiz: [],
                    }),
                )
              }
            >
              Ajouter une leçon au module {m + 1}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => update((d) => void d.splice(m, 1))}
            >
              Retirer le module {m + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => update((d) => void d.push({ title: '', lessons: [] }))}
        >
          Ajouter un module
        </button>
        <button type="button" className={buttonClass} onClick={save} disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer le plan'}
        </button>
      </div>
      {status && (
        <p
          role={status.ok ? 'status' : 'alert'}
          className={`font-bold ${status.ok ? '' : 'text-error'}`}
          data-testid="outline-status"
        >
          {status.message}
        </p>
      )}
    </div>
  );
}

/** Questions à choix d'une leçon : deux à quatre choix, une bonne réponse, une explication. */
function QuizEditor({
  label,
  quiz,
  onChange,
}: {
  label: string;
  quiz: Quiz;
  onChange: (fn: (draft: Quiz) => void) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-card border border-line p-3">
      <legend className="px-1 font-bold">{label} : quiz (facultatif)</legend>
      {quiz.map((q, i) => {
        const name = `${label}, question ${i + 1}`;
        return (
          <div key={i} className="space-y-2 border-l-4 border-line pl-3">
            <label className="block font-bold">
              {name} : énoncé
              <input
                className={inputClass}
                value={q.prompt}
                onChange={(e) => onChange((d) => void (d[i]!.prompt = e.target.value))}
              />
            </label>
            {q.choices.map((choice, c) => (
              <div key={c} className="flex flex-wrap items-end gap-3">
                <label className="block grow font-bold">
                  {name}, choix {c + 1}
                  <input
                    className={inputClass}
                    value={choice}
                    onChange={(e) => onChange((d) => void (d[i]!.choices[c] = e.target.value))}
                  />
                </label>
                <label className="flex min-h-[44px] items-center gap-2">
                  <input
                    type="radio"
                    name={`${name}-bonne-reponse`}
                    checked={q.correct === c}
                    onChange={() => onChange((d) => void (d[i]!.correct = c))}
                    className="h-5 w-5"
                  />
                  Bonne réponse
                  <span className="sr-only">
                    {' '}
                    : {name}, choix {c + 1}
                  </span>
                </label>
                {q.choices.length > 2 && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() =>
                      onChange((d) => {
                        const question = d[i]!;
                        question.choices.splice(c, 1);
                        // La bonne réponse garde son texte ; sans elle, on revient au premier choix.
                        if (question.correct === c) question.correct = 0;
                        else if (question.correct > c) question.correct -= 1;
                      })
                    }
                  >
                    Retirer<span className="sr-only"> le choix {c + 1}</span>
                  </button>
                )}
              </div>
            ))}
            {q.choices.length < 4 && (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => onChange((d) => void d[i]!.choices.push(''))}
              >
                Ajouter un choix<span className="sr-only"> à la {name.toLowerCase()}</span>
              </button>
            )}
            <label className="block font-bold">
              {name} : explication montrée après la réponse
              <textarea
                className={inputClass}
                rows={2}
                value={q.explanation}
                onChange={(e) => onChange((d) => void (d[i]!.explanation = e.target.value))}
              />
            </label>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => onChange((d) => void d.splice(i, 1))}
            >
              Retirer la {name.toLowerCase()}
            </button>
          </div>
        );
      })}
      {quiz.length < 10 && (
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => onChange((d) => void d.push(emptyQuestion()))}
        >
          Ajouter une question<span className="sr-only"> au quiz de la {label.toLowerCase()}</span>
        </button>
      )}
    </fieldset>
  );
}
