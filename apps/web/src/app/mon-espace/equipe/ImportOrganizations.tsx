'use client';

import { useActionState } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import { importOrganizationsAction, type ImportState } from './actions';

const STATUS_LABELS = { create: 'Sera créé', exists: 'Existe déjà', error: 'Erreur' } as const;

/** Import CSV en deux temps : aperçu ligne par ligne, puis confirmation avec le même fichier. */
export function ImportOrganizations() {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importOrganizationsAction,
    null,
  );
  const result = state && 'lines' in state ? state : null;
  const hasError = result?.lines.some((l) => l.status === 'error') ?? false;
  const toCreate = result?.lines.filter((l) => l.status === 'create').length ?? 0;

  return (
    <form
      action={action}
      className="space-y-4 rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]"
    >
      <h2 className="text-xl font-bold">Importer des établissements</h2>
      <p>
        Un fichier CSV avec les colonnes : nom officiel, type, direction régionale, localité,
        responsable (facultatif : contact, structure parente).{' '}
        <a href="/modele-etablissements.csv" download>
          Télécharger le modèle
        </a>
        . Rien n’est enregistré avant votre confirmation.
      </p>
      <label className="block font-bold">
        Fichier CSV
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required={!result}
          className={inputClass}
        />
      </label>
      {result && !result.confirmed && <input type="hidden" name="csv" value={result.csv} />}
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? 'Lecture…' : 'Voir l’aperçu'}
      </button>

      {state && 'error' in state && (
        <p role="alert" className="font-bold">
          {state.error}
        </p>
      )}

      {result && (
        <div className="space-y-3" aria-live="polite">
          {result.confirmed ? (
            <p role="status" className="font-bold" data-testid="import-done">
              {result.created} établissement{result.created > 1 ? 's' : ''} créé
              {result.created > 1 ? 's' : ''}.
            </p>
          ) : (
            <>
              <ul className="space-y-1" data-testid="import-preview">
                {result.lines.map((l) => (
                  <li key={l.line}>
                    Ligne {l.line} · <strong>{l.name || '(sans nom)'}</strong> ·{' '}
                    {STATUS_LABELS[l.status]} : {l.message}
                  </li>
                ))}
              </ul>
              {hasError ? (
                <p className="font-bold">Corrigez le fichier, puis refaites l’aperçu.</p>
              ) : toCreate > 0 ? (
                <button type="submit" name="confirm" value="1" className={buttonClass}>
                  Confirmer l’import ({toCreate})
                </button>
              ) : (
                <p>Rien à créer.</p>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}
