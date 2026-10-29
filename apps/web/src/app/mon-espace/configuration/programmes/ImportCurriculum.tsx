'use client';

import { useActionState } from 'react';
import { buttonClass, inputClass } from '@/components/Notice';
import { importCurriculumAction, type ImportCurriculumState } from './actions';

/** Import d'un fichier de programme : il devient un brouillon, à relire avant de le publier. */
export function ImportCurriculum() {
  const [state, action, pending] = useActionState<ImportCurriculumState, FormData>(
    importCurriculumAction,
    null,
  );
  return (
    <form action={action} className="space-y-4">
      <p>
        Un fichier JSON qui décrit une version du programme : niveaux, matières, compétences et
        prérequis.{' '}
        <a href="/modele-programme.json" download>
          Télécharger un modèle
        </a>
        . Le programme arrive en <strong>brouillon</strong> : personne ne le voit avant sa
        publication.
      </p>
      <label className="block font-bold">
        Fichier du programme
        <input
          type="file"
          name="file"
          accept=".json,application/json"
          required
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Import…' : 'Importer le brouillon'}
      </button>
      {state && (
        <p role="alert" className="whitespace-pre-line font-bold text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
