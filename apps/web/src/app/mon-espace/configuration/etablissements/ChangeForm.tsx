'use client';

import { checkEstablishmentField, type EstablishmentField } from '@lenseignement/types';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { buttonClass, inputClass } from '@/components/Notice';
import { establishmentChangeAction, type FormState } from '../actions';
import { FieldInput } from './FieldInput';

interface Props {
  id: string;
  /** Champs qui évoluent dans la vie de l'établissement, avec leur valeur actuelle lisible. */
  fields: Array<{ field: EstablishmentField; current: string; raw: string | string[] }>;
  today: string;
}

/**
 * « Mettre à jour » : enregistrer un changement réel (nouveau responsable, nouvelle filière…) à sa
 * date. L'ancienne valeur reste dans l'historique de la fiche.
 */
export function ChangeForm({ id, fields, today }: Props) {
  const [key, setKey] = useState(fields[0]?.field.key ?? '');
  const [error, setError] = useState<string>();
  const [state, action, pending] = useActionState<FormState, FormData>(
    establishmentChangeAction,
    null,
  );
  const chosen = fields.find((f) => f.field.key === key);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return;
    const form = new FormData(event.currentTarget);
    const value = form.getAll('value').join(', ');
    const checked = checkEstablishmentField({ ...chosen.field, required: true }, value);
    if ('error' in checked) {
      setError(checked.error);
      return;
    }
    setError(undefined);
    startTransition(() => action(form));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="change-form">
      <input type="hidden" name="id" value={id} />
      <p className="text-ink-muted">
        Pour un vrai changement dans la vie de l’établissement. Pour corriger une faute de saisie,
        utilisez plutôt « Modifier ».
      </p>
      <label className="block font-bold">
        Ce qui change
        <select
          name="field"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setError(undefined);
          }}
          className={inputClass}
        >
          {fields.map((f) => (
            <option key={f.field.key} value={f.field.key}>
              {f.field.label}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <>
          <p>
            Valeur actuelle : <strong>{chosen.current || 'non renseignée'}</strong>
          </p>
          <FieldInput
            key={chosen.field.key}
            field={{ ...chosen.field, label: 'Nouvelle valeur', required: true }}
            name="value"
            defaultValue={chosen.raw}
            error={error}
          />
        </>
      )}
      <label className="block font-bold">
        Depuis le
        <input
          type="date"
          name="effectiveOn"
          defaultValue={today}
          max={today}
          required
          className={inputClass}
        />
      </label>
      <label className="block font-bold">
        Motif (facultatif)
        <input
          name="note"
          maxLength={300}
          placeholder="Par exemple : nomination de rentrée"
          className={inputClass}
        />
      </label>
      {state?.error && (
        <p role="alert" className="font-bold text-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Enregistrement…' : 'Enregistrer la mise à jour'}
      </button>
    </form>
  );
}
