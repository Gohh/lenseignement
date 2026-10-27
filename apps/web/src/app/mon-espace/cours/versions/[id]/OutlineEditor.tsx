'use client';

import type { CourseVersionDetail } from '@lenseignement/types';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import { saveOutlineAction } from '../../actions';

type Modules = CourseVersionDetail['modules'];

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
      // Recharge la page : nouvelle révision pour les formulaires, plan relu depuis l'API.
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
                  (d) => void d[m]!.lessons.push({ title: '', body: '', estimatedMinutes: null }),
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
