import type { EstablishmentField } from '@lenseignement/types';
import { inputClass } from '@/components/Notice';

interface Props {
  field: EstablishmentField;
  /** Valeur de départ : texte, ou liste de valeurs pour les cases à cocher. */
  defaultValue?: string | string[];
  error?: string;
  /** Nom envoyé au serveur (par défaut, la clé du champ). */
  name?: string;
  /** Pour le champ DRENA : les directions régionales de la personne. */
  directions?: Array<{ id: string; name: string }>;
  /** Pour le champ DRENA : la DRENA ne peut pas être changée ici. */
  locked?: boolean;
}

/**
 * Un champ de la fiche d'établissement, dessiné d'après sa description (type, obligatoire, aide).
 * Le même composant sert à la création, à « Modifier » et à « Mettre à jour ».
 */
export function FieldInput({ field, defaultValue, error, name, directions = [], locked }: Props) {
  const inputName = name ?? field.key;
  const id = `champ-${inputName}`;
  const describedBy =
    [field.hint ? `${id}-aide` : null, error ? `${id}-erreur` : null].filter(Boolean).join(' ') ||
    undefined;
  const single = Array.isArray(defaultValue) ? defaultValue.join(', ') : (defaultValue ?? '');
  const title = (
    <>
      {field.label}
      {field.required && (
        <span aria-hidden="true" className="text-error">
          {' '}
          *
        </span>
      )}
      {field.required && <span className="sr-only"> (obligatoire)</span>}
    </>
  );
  const help = (
    <>
      {field.hint && (
        <span id={`${id}-aide`} className="mt-1 block text-sm font-normal text-ink-muted">
          {field.hint}
        </span>
      )}
      {error && (
        <span id={`${id}-erreur`} className="mt-1 block font-bold text-error">
          {error}
        </span>
      )}
    </>
  );
  const common = {
    id,
    name: inputName,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: inputClass,
  };

  if (field.kind === 'choices') {
    const checked = Array.isArray(defaultValue) ? defaultValue : single ? single.split(/,\s*/) : [];
    return (
      <fieldset aria-describedby={describedBy} data-field={inputName}>
        <legend className="font-bold">{title}</legend>
        <div className="mt-1 flex flex-wrap gap-x-6">
          {field.options!.map((o) => (
            <label key={o.value} className="flex min-h-[44px] items-center gap-3">
              <input
                type="checkbox"
                name={inputName}
                value={o.value}
                defaultChecked={checked.includes(o.value)}
                className="h-6 w-6 accent-primary"
              />
              {o.label}
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }

  let control;
  if (field.kind === 'direction') {
    control = locked ? (
      <>
        <input type="hidden" name="parentId" value={single} />
        <span className="mt-1 block min-h-[44px] py-2 font-normal">
          {directions.find((d) => d.id === single)?.name ?? '–'}
        </span>
      </>
    ) : (
      <select {...common} name="parentId" defaultValue={single}>
        <option value="">Choisir…</option>
        {directions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'choice') {
    control = (
      <select {...common} defaultValue={single}>
        <option value="">Choisir…</option>
        {field.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    const kind = {
      phone: { type: 'tel', inputMode: 'tel' as const, autoComplete: 'tel' },
      email: { type: 'email', inputMode: 'email' as const, autoComplete: 'email' },
      number: { type: 'text', inputMode: 'numeric' as const },
      year: { type: 'text', inputMode: 'numeric' as const, maxLength: 4 },
    }[field.kind as string] ?? { type: 'text' };
    control = (
      <input
        {...common}
        {...kind}
        defaultValue={single}
        placeholder={field.kind === 'list' ? 'Séparez par des virgules' : undefined}
      />
    );
  }
  // L'aide et l'erreur restent hors du libellé : elles sont reliées par aria-describedby.
  return (
    <div data-field={inputName}>
      <label className="block font-bold" htmlFor={id}>
        {title}
      </label>
      {control}
      {help}
    </div>
  );
}
