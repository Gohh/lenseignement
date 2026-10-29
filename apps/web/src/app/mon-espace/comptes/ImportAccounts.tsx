'use client';

import { TEAM_ROLE_LABELS } from '@lenseignement/types';
import { useActionState } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import { importAccountsAction, type ImportAccountsState } from './actions';

/** Import de comptes d'équipe depuis un tableau ; les mots de passe s'affichent une seule fois. */
export function ImportAccounts({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<ImportAccountsState, FormData>(
    importAccountsAction,
    {},
  );

  if (!configured) {
    return (
      <p
        className="rounded-card border-2 border-primary bg-primary-soft p-4 font-bold"
        role="status"
      >
        La création de comptes demande un réglage unique dans Keycloak (guide « Créer un compte »).
      </p>
    );
  }

  if (state.result) {
    const { created, failed } = state.result;
    const csv = [
      'Nom;E-mail;Rôle;Établissement;Mot de passe provisoire',
      ...created.map(
        (c) =>
          `${c.displayName};${c.email};${TEAM_ROLE_LABELS[c.role] ?? c.role};${c.organization};${c.temporaryPassword}`,
      ),
    ].join('\r\n');
    return (
      <div className="space-y-4" role="status">
        <p className="font-bold">
          {created.length} compte{created.length > 1 ? 's créés' : ' créé'}.
        </p>
        {created.length > 0 && (
          <>
            <table className="w-full text-left" data-testid="imported-accounts">
              <thead>
                <tr>
                  <th className="py-1 pr-3">Nom</th>
                  <th className="py-1 pr-3">Identifiant (e-mail)</th>
                  <th className="py-1">Mot de passe provisoire</th>
                </tr>
              </thead>
              <tbody>
                {created.map((c) => (
                  <tr key={c.email} className="border-t border-line">
                    <td className="py-1 pr-3">
                      {c.displayName}
                      <span className="block text-sm text-ink-muted">
                        {TEAM_ROLE_LABELS[c.role] ?? c.role}, {c.organization}
                      </span>
                    </td>
                    <td className="py-1 pr-3 font-bold">{c.email}</td>
                    <td className="py-1 font-bold tracking-wider">{c.temporaryPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Imprimez ou téléchargez cette liste maintenant : les mots de passe ne seront plus
              affichés. Chacun les change à sa première connexion.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={buttonClass} onClick={() => window.print()}>
                Imprimer
              </button>
              <a
                className={secondaryButtonClass}
                download="comptes-crees.csv"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}`)}`}
              >
                Télécharger (CSV)
              </a>
            </div>
          </>
        )}
        {failed.length > 0 && (
          <div role="alert">
            <p className="font-bold">Lignes non créées :</p>
            <ul className="list-disc pl-6">
              {failed.map((f) => (
                <li key={f.line}>
                  Ligne {f.line} ({f.name}) : {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p>
        Un tableau Excel enregistré en CSV, une ligne par personne : Nom ; Prénom ; E-mail ; Rôle ;
        Établissement (écrit comme dans Configuration).{' '}
        <a href="/modele-comptes.csv" download>
          Télécharger le modèle Excel
        </a>
        .
      </p>
      {state.error && (
        <p role="alert" className="font-bold text-error">
          {state.error}
        </p>
      )}
      <label className="block font-bold">
        Tableau des comptes (.csv)
        <input type="file" name="file" accept=".csv,text/csv" required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Création…' : 'Créer les comptes'}
      </button>
    </form>
  );
}
