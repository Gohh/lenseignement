import {
  ESTABLISHMENT_CATEGORIES,
  establishmentFields,
  establishmentValue,
  type EstablishmentCategory,
  type OrganizationListItem,
} from '@lenseignement/types';

export const asCategory = (type: string): EstablishmentCategory | null =>
  (ESTABLISHMENT_CATEGORIES as readonly string[]).includes(type)
    ? (type as EstablishmentCategory)
    : null;

/** Valeurs de départ du formulaire : texte, ou liste pour les cases à cocher. */
export function defaultsOf(
  o: OrganizationListItem,
  category: EstablishmentCategory,
): Record<string, string | string[]> {
  const defaults: Record<string, string | string[]> = { parentId: o.direction?.id ?? '' };
  for (const field of establishmentFields(category)) {
    if (field.kind === 'direction') continue;
    const value = establishmentValue(o, field.key);
    if (value === null || value === undefined) continue;
    defaults[field.key] =
      field.kind === 'choices' && Array.isArray(value)
        ? value
        : Array.isArray(value)
          ? value.join(', ')
          : String(value);
  }
  return defaults;
}
