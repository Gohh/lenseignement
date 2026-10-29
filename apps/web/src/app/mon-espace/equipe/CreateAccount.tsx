'use client';

import { BRANCHES, TEAM_ROLE_LABELS } from '@lenseignement/types';
import { useActionState } from 'react';
import { buttonClass, inputClass } from '@/components/Notice';
import { createAccountAction, type CreateAccountState } from './actions';

interface Props {
  organizations: Array<{ id: string; name: string }>;
  grantable: string[];
  /** Le réglage unique de Keycloak est-il fait ? */
  configured: boolean;
}

/** Formulaire « Créer un compte » : le mot de passe provisoire s'affiche une seule fois. */
export function CreateAccount({ organizations, grantable, configured }: Props) {
  const [state, action, pending] = useActionState<CreateAccountState, FormData>(
    createAccountAction,
    {},
  );

  if (!configured) {
    return (
      <p
        className="rounded-card border-2 border-primary bg-primary-soft p-4 font-bold"
        role="status"
      >
        La création de comptes demande un réglage unique dans Keycloak. Demandez-le à la personne
        qui installe la plateforme (guide « Créer un compte », étape Keycloak).
      </p>
    );
  }

  if (state.created) {
    const c = state.created;
    return (
      <div className="space-y-3" role="status">
        <p className="font-bold">
          Compte créé pour {c.displayName} ({TEAM_ROLE_LABELS[c.role] ?? c.role}, {c.organization}).
        </p>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="font-bold">Identifiant</dt>
          <dd data-testid="account-email">{c.email}</dd>
          <dt className="font-bold">Mot de passe provisoire</dt>
          <dd className="text-2xl font-bold tracking-wider" data-testid="account-password">
            {c.temporaryPassword}
          </dd>
        </dl>
        <p>
          Notez-le maintenant : il ne sera plus affiché. La personne se connecte avec son e-mail et
          ce mot de passe, puis en choisit un nouveau.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p
          role="alert"
          className="rounded-card border-2 border-error bg-surface p-4 font-bold text-error"
        >
          {state.error}
        </p>
      )}
      <label className="block font-bold">
        Prénom et nom
        <input
          name="displayName"
          className={inputClass}
          required
          maxLength={120}
          autoComplete="off"
        />
      </label>
      <label className="block font-bold">
        Adresse e-mail
        <input
          name="email"
          type="email"
          className={inputClass}
          required
          maxLength={200}
          autoComplete="off"
        />
      </label>
      <label className="block font-bold">
        Établissement
        <select name="organizationId" className={inputClass} required>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block font-bold">
        Rôle
        <select name="role" className={inputClass} required>
          {grantable.map((role) => (
            <option key={role} value={role}>
              {TEAM_ROLE_LABELS[role] ?? role}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-1">
        <legend className="font-bold">Cycles accordés (aucun coché : tous)</legend>
        {BRANCHES.map((b) => (
          <label key={b.code} className="flex min-h-[44px] items-center gap-2">
            <input
              type="checkbox"
              name="branch"
              value={b.code}
              className="h-6 w-6 accent-primary"
            />
            {b.title}
          </label>
        ))}
      </fieldset>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? 'Création…' : 'Créer le compte'}
      </button>
    </form>
  );
}
