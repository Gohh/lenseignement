'use client';

import { useActionState } from 'react';
import type { ImportState } from '@/app/mon-espace/fabrique/actions';
import { buttonClass, inputClass } from './Notice';

/** Formulaire d'import : structure, programme, fichier ; puis le bilan de l'import. */
export function ExerciseImportForm({
  action,
  organizations,
  curricula,
}: {
  action: (previous: ImportState, form: FormData) => Promise<ImportState>;
  organizations: Array<{ id: string; name: string }>;
  curricula: Array<{ id: string; label: string }>;
}) {
  const [state, submit, pending] = useActionState(action, { kind: 'idle' });

  return (
    <div className="space-y-4">
      <form action={submit} className="space-y-4 rounded-big border border-line bg-surface p-5">
        <label className="block font-bold">
          Structure
          <select name="organizationId" required className={inputClass}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-bold">
          Programme (les codes de compétence du fichier viennent de ce programme)
          <select name="curriculumVersionId" required className={inputClass}>
            {curricula.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-bold">
          Fichier d’exercices (.json)
          <input
            type="file"
            name="file"
            accept=".json,application/json"
            required
            className={inputClass}
          />
        </label>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? 'Import…' : 'Importer'}
        </button>
      </form>

      {state.kind === 'error' && (
        <p role="alert" className="font-bold text-error">
          {state.message}
        </p>
      )}
      {state.kind === 'done' && (
        <div
          role="status"
          className="space-y-2 rounded-card border-2 border-primary bg-primary-soft p-4"
          data-testid="import-result"
        >
          <p className="font-bold">
            {state.created === 0
              ? 'Aucun exercice importé.'
              : `✓ ${state.created} exercice${state.created > 1 ? 's' : ''} importé${state.created > 1 ? 's' : ''} : ${state.created > 1 ? 'ils attendent' : 'il attend'} la relecture dans la banque.`}
          </p>
          {state.errors.length > 0 && (
            <>
              <p className="font-bold">
                {state.errors.length} exercice{state.errors.length > 1 ? 's' : ''} refusé
                {state.errors.length > 1 ? 's' : ''} :
              </p>
              <ul className="list-disc pl-6">
                {state.errors.map((e) => (
                  <li key={e.index}>
                    n° {e.index}
                    {e.title ? ` « ${e.title} »` : ''} : {e.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
