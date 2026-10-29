'use client';

import { BRANCHES } from '@lenseignement/types';
import { useActionState, useState } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import {
  importCurriculumAction,
  importCurriculumTableAction,
  type ImportCurriculumState,
} from './actions';

interface Programme {
  code: string;
  branch: string;
  title: string;
  description: string;
}

function ErrorText({ state }: { state: ImportCurriculumState }) {
  return state ? (
    <p role="alert" className="whitespace-pre-line font-bold text-error">
      {state.error}
    </p>
  ) : null;
}

/**
 * Import d'un programme : un tableau Excel (une ligne par compétence) avec le formulaire du
 * programme, ou un fichier JSON complet. Le programme arrive en brouillon.
 */
export function ImportCurriculum({ programmes }: { programmes: Programme[] }) {
  const [tableState, tableAction, tablePending] = useActionState<ImportCurriculumState, FormData>(
    importCurriculumTableAction,
    null,
  );
  const [jsonState, jsonAction, jsonPending] = useActionState<ImportCurriculumState, FormData>(
    importCurriculumAction,
    null,
  );
  const [chosen, setChosen] = useState('');
  const existing = programmes.find((p) => p.code === chosen);

  return (
    <div className="space-y-6">
      <form action={tableAction} className="space-y-4">
        <p>
          Recopiez les compétences dans un tableau Excel, une ligne par compétence, puis
          enregistrez-le en <strong>CSV</strong> (« Fichier », « Enregistrer sous », « CSV
          (séparateur : point-virgule) »).{' '}
          <a href="/modele-programme.csv" download>
            Télécharger le modèle Excel
          </a>
          . Le programme arrive en <strong>brouillon</strong> : personne ne le voit avant sa
          publication.
        </p>
        <label className="block font-bold">
          Programme
          <select value={chosen} onChange={(e) => setChosen(e.target.value)} className={inputClass}>
            <option value="">Nouveau programme</option>
            {programmes.map((p) => (
              <option key={p.code} value={p.code}>
                Nouvelle version de : {p.title}
              </option>
            ))}
          </select>
        </label>
        {existing ? (
          <>
            <input type="hidden" name="code" value={existing.code} />
            <input type="hidden" name="branch" value={existing.branch} />
            <input type="hidden" name="title" value={existing.title} />
            <input type="hidden" name="description" value={existing.description} />
          </>
        ) : (
          <fieldset className="space-y-4">
            <label className="block font-bold">
              Titre du programme
              <input
                name="title"
                required
                placeholder="Programme du primaire (Côte d’Ivoire)"
                className={inputClass}
              />
            </label>
            <label className="block font-bold">
              Code court
              <input
                name="code"
                required
                placeholder="PRIMAIRE-CI"
                className={`${inputClass} uppercase`}
              />
              <span className="block text-sm font-normal text-ink-muted">
                Majuscules, chiffres et tirets. Il ne change plus ensuite.
              </span>
            </label>
            <label className="block font-bold">
              Cycle
              <select name="branch" required defaultValue="primaire" className={inputClass}>
                {BRANCHES.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-bold">
              Description
              <input
                name="description"
                required
                placeholder="Une phrase pour dire à qui il s’adresse"
                className={inputClass}
              />
            </label>
          </fieldset>
        )}
        <label className="block font-bold">
          Version
          <input name="label" required placeholder="2026" className={inputClass} />
        </label>
        <label className="block font-bold">
          Texte de référence
          <input
            name="sourceTitle"
            required
            placeholder="Programme éducatif national, édition 2026"
            className={inputClass}
          />
        </label>
        <label className="block font-bold">
          Publié par
          <input
            name="sourceIssuer"
            required
            placeholder="Ministère de l’Éducation nationale"
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" name="isOfficial" className="h-5 w-5" />
          C’est le texte officiel, et sa reprise est autorisée
        </label>
        <label className="block font-bold">
          Tableau des compétences (.csv)
          <input type="file" name="table" accept=".csv,text/csv" required className={inputClass} />
        </label>
        <button type="submit" disabled={tablePending} className={buttonClass}>
          {tablePending ? 'Import…' : 'Importer le brouillon'}
        </button>
        <ErrorText state={tableState} />
      </form>

      <details className="rounded-card border border-line p-4">
        <summary className="cursor-pointer font-bold">Avancé : importer un fichier JSON</summary>
        <form action={jsonAction} className="mt-4 space-y-4">
          <p>
            Un fichier JSON qui décrit toute la version.{' '}
            <a href="/modele-programme.json" download>
              Télécharger un exemple
            </a>
            .
          </p>
          <label className="block font-bold">
            Fichier JSON
            <input
              type="file"
              name="file"
              accept=".json,application/json"
              required
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={jsonPending} className={secondaryButtonClass}>
            {jsonPending ? 'Import…' : 'Importer le fichier JSON'}
          </button>
          <ErrorText state={jsonState} />
        </form>
      </details>
    </div>
  );
}
