'use client';

import {
  checkEstablishment,
  COMMON_ESTABLISHMENT_FIELDS,
  CATEGORY_ESTABLISHMENT_FIELDS,
  ESTABLISHMENT_CATEGORIES,
  ESTABLISHMENT_CATEGORY_LABELS,
  type EstablishmentCategory,
  type EstablishmentField,
} from '@lenseignement/types';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { buttonClass, inputClass } from '@/components/Notice';
import { saveEstablishmentAction, type FormState } from '../actions';
import { FieldInput } from './FieldInput';

interface Props {
  category: EstablishmentCategory;
  directions: Array<{ id: string; name: string }>;
  /** Fiche existante (« Modifier ») ; absent pour une création. */
  id?: string;
  defaults?: Record<string, string | string[]>;
  /** Superadministrateur et administrateur : changer la catégorie ou la DRENA. */
  canChangeStructure?: boolean;
}

/** Groupes de la fiche, dans l'ordre d'affichage. */
const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Identité', keys: ['name', 'officialCode', 'status', 'openedYear'] },
  { title: 'Rattachement et lieu', keys: ['direction', 'locality', 'municipality'] },
  { title: 'Responsable et contact', keys: ['managerName', 'phone', 'email'] },
];

/**
 * Formulaire de la fiche : les champs suivent la catégorie. Les contrôles tournent d'abord ici
 * (mêmes règles que l'API), pour signaler chaque erreur à côté de son champ sans perdre la saisie.
 */
export function EstablishmentForm({
  category: initial,
  directions,
  id,
  defaults = {},
  canChangeStructure = false,
}: Props) {
  const [category, setCategory] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveEstablishmentAction,
    null,
  );
  const creating = !id;
  const lockedDirection = !creating && !canChangeStructure;
  const byKey = new Map(COMMON_ESTABLISHMENT_FIELDS.map((f) => [f.key, f]));
  const own = CATEGORY_ESTABLISHMENT_FIELDS[category];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw: Record<string, string> = {};
    for (const key of new Set(form.keys())) raw[key] = form.getAll(key).join(', ');
    raw.direction = directions.find((d) => d.id === form.get('parentId'))?.name ?? '';
    const found = checkEstablishment(category, raw).errors;
    const next = Object.fromEntries(found.map((e) => [e.field, e.message]));
    setErrors(next);
    if (found.length > 0) {
      const first = found[0]!.field;
      event.currentTarget
        .querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] select`)
        ?.focus();
      return;
    }
    // Appel direct : le formulaire n'est pas vidé, la saisie reste si l'API refuse.
    startTransition(() => action(form));
  }

  const field = (f: EstablishmentField) => (
    <div key={f.key} className={f.kind === 'choices' ? 'sm:col-span-2' : undefined}>
      <FieldInput
        field={f}
        defaultValue={f.kind === 'direction' ? defaults.parentId : defaults[f.key]}
        error={errors[f.key]}
        directions={directions}
        locked={f.kind === 'direction' && lockedDirection}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" data-testid="establishment-form">
      {id && <input type="hidden" name="id" value={id} />}
      {canChangeStructure && <input type="hidden" name="structure" value="1" />}
      <p className="text-ink-muted">
        Les champs marqués <span className="text-error">*</span> sont obligatoires.
      </p>
      {creating || !canChangeStructure ? (
        <input type="hidden" name="category" value={category} />
      ) : (
        <label className="block font-bold">
          Type d’établissement
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as EstablishmentCategory)}
            className={inputClass}
          >
            {ESTABLISHMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ESTABLISHMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-sm font-normal text-ink-muted">
            Changer le type change aussi les informations propres demandées plus bas.
          </span>
        </label>
      )}
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="space-y-4">
          <legend className="font-extrabold text-primary">{g.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">{g.keys.map((k) => field(byKey.get(k)!))}</div>
        </fieldset>
      ))}
      <fieldset className="space-y-4">
        <legend className="font-extrabold text-primary">
          Propre à : {ESTABLISHMENT_CATEGORY_LABELS[category]}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">{own.map(field)}</div>
      </fieldset>
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="font-bold text-error">
          {Object.keys(errors).length === 1
            ? 'Une information est à corriger.'
            : `${Object.keys(errors).length} informations sont à corriger.`}{' '}
          Les messages sont à côté des champs.
        </p>
      )}
      {state?.error && (
        <p role="alert" className="rounded-card border-2 border-error p-4 font-bold text-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending
          ? 'Enregistrement…'
          : creating
            ? 'Enregistrer l’établissement'
            : 'Enregistrer les corrections'}
      </button>
    </form>
  );
}
