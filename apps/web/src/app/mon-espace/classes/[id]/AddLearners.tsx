'use client';

import { useActionState } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import { addLearnersAction, type AddLearnersState } from './actions';

/** Inscrire des élèves sans e-mail : une liste collée ou un fichier CSV, puis la feuille à imprimer. */
export function AddLearners({ cohortId, configured }: { cohortId: string; configured: boolean }) {
  const [state, action, pending] = useActionState<AddLearnersState, FormData>(
    addLearnersAction,
    {},
  );

  if (!configured) {
    return (
      <p
        className="rounded-card border-2 border-primary bg-primary-soft p-4 font-bold"
        role="status"
      >
        L’inscription d’élèves demande un réglage unique dans Keycloak (guide « Créer un compte »).
        En attendant, les élèves peuvent rejoindre la classe avec son code.
      </p>
    );
  }

  if (state.result) {
    const { created, failed } = state.result;
    const csv = [
      'Nom complet;Identifiant;Mot de passe provisoire',
      ...created.map((c) => `${c.displayName};${c.username};${c.temporaryPassword}`),
    ].join('\r\n');
    return (
      <div className="space-y-4" role="status">
        <p className="font-bold">
          {created.length} élève{created.length > 1 ? 's inscrits' : ' inscrit'} dans la classe.
        </p>
        {created.length > 0 && (
          <>
            <table className="w-full text-left" data-testid="new-learners">
              <thead>
                <tr>
                  <th className="py-1 pr-3">Élève</th>
                  <th className="py-1 pr-3">Identifiant</th>
                  <th className="py-1">Mot de passe provisoire</th>
                </tr>
              </thead>
              <tbody>
                {created.map((c) => (
                  <tr key={c.username} className="border-t border-line">
                    <td className="py-1 pr-3">{c.displayName}</td>
                    <td className="py-1 pr-3 font-bold">{c.username}</td>
                    <td className="py-1 font-bold tracking-wider">{c.temporaryPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Imprime ou télécharge cette liste maintenant : les mots de passe ne seront plus
              affichés. Chaque élève se connecte avec son identifiant et ce mot de passe, puis en
              choisit un nouveau.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={buttonClass} onClick={() => window.print()}>
                Imprimer
              </button>
              <a
                className={secondaryButtonClass}
                download="identifiants-eleves.csv"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}`)}`}
              >
                Télécharger (CSV)
              </a>
            </div>
          </>
        )}
        {failed.length > 0 && (
          <div role="alert">
            <p className="font-bold">Non inscrits :</p>
            <ul className="list-disc pl-6">
              {failed.map((f) => (
                <li key={f.displayName}>
                  {f.displayName} : {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Skipped lines={state.skipped} />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="cohortId" value={cohortId} />
      {state.error && (
        <p
          role="alert"
          className="rounded-card border-2 border-error bg-surface p-4 font-bold text-error"
        >
          {state.error}
        </p>
      )}
      <Skipped lines={state.skipped} />
      <label className="block font-bold">
        Liste des élèves (une ligne par élève : Nom ; Prénom)
        <textarea
          name="list"
          rows={6}
          className={inputClass}
          placeholder={'KONÉ ; Awa\nTRAORÉ ; Moussa'}
        />
      </label>
      <label className="block font-bold">
        Ou un fichier CSV (Excel : « Enregistrer sous… CSV »)
        <input
          name="file"
          type="file"
          accept=".csv,text/csv,text/plain"
          className="mt-1 block min-h-[44px]"
        />
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? 'Inscription…' : 'Inscrire les élèves'}
      </button>
    </form>
  );
}

function Skipped({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <div className="rounded-card border border-line p-3">
      <p className="font-bold">Lignes ignorées :</p>
      <ul className="list-disc pl-6">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
