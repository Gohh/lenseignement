import { z } from 'zod';

/**
 * Module des établissements : six catégories, un tronc commun de champs et des champs propres à
 * chaque catégorie. La même description sert au formulaire, au modèle d'import (CSV) et aux
 * contrôles, côté navigateur comme côté API.
 */
export const ESTABLISHMENT_CATEGORIES = [
  'preschool',
  'primary',
  'college',
  'lycee',
  'literacy_center',
  'technical_center',
] as const;
export type EstablishmentCategory = (typeof ESTABLISHMENT_CATEGORIES)[number];

export const ESTABLISHMENT_CATEGORY_LABELS: Record<EstablishmentCategory, string> = {
  preschool: 'Établissement préscolaire',
  primary: 'École primaire',
  college: 'Collège',
  lycee: 'Lycée',
  literacy_center: 'Centre d’alphabétisation',
  technical_center: 'Établissement d’enseignement technique',
};

/** Courte explication affichée sur la carte de choix de la catégorie. */
export const ESTABLISHMENT_CATEGORY_HINTS: Record<EstablishmentCategory, string> = {
  preschool: 'Petite, moyenne et grande section',
  primary: 'CP1 à CM2',
  college: '6e à 3e',
  lycee: '2nde à Terminale',
  literacy_center: 'Alpha 1 à 3, jeunes et adultes',
  technical_center: 'Lycées professionnels et centres de formation',
};

export const ESTABLISHMENT_STATUSES = [
  'public',
  'prive-laic',
  'prive-confessionnel',
  'communautaire',
] as const;
export type EstablishmentStatus = (typeof ESTABLISHMENT_STATUSES)[number];

export const ESTABLISHMENT_STATUS_LABELS: Record<EstablishmentStatus, string> = {
  public: 'Public',
  'prive-laic': 'Privé laïc',
  'prive-confessionnel': 'Privé confessionnel',
  communautaire: 'Communautaire',
};

const PRESCHOOL_SECTIONS = [
  { value: 'petite', label: 'Petite section' },
  { value: 'moyenne', label: 'Moyenne section' },
  { value: 'grande', label: 'Grande section' },
] as const;

export type EstablishmentFieldKind =
  'text' | 'number' | 'year' | 'phone' | 'email' | 'choice' | 'choices' | 'list' | 'direction';

export interface EstablishmentField {
  key: string;
  label: string;
  kind: EstablishmentFieldKind;
  required: boolean;
  /** Valeurs permises (choice, choices). */
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** Aide sous le champ et dans le modèle. */
  hint?: string;
  /** Exemple écrit dans la deuxième ligne du modèle d'import. */
  example: string;
  /** Champ qui change dans la vie de l'établissement : « Mettre à jour » le date et l'historise. */
  evolves?: boolean;
}

const statusOptions = ESTABLISHMENT_STATUSES.map((value) => ({
  value,
  label: ESTABLISHMENT_STATUS_LABELS[value],
}));

/** Tronc commun, dans l'ordre du formulaire et du modèle. */
export const COMMON_ESTABLISHMENT_FIELDS: readonly EstablishmentField[] = [
  {
    key: 'name',
    label: 'Nom officiel',
    kind: 'text',
    required: true,
    example: 'EPP Les Manguiers',
  },
  {
    key: 'officialCode',
    label: 'Code officiel',
    kind: 'text',
    required: false,
    hint: 'Code donné par le ministère, s’il existe. Deux établissements ne peuvent pas avoir le même.',
    example: '',
  },
  {
    key: 'status',
    label: 'Statut',
    kind: 'choice',
    required: true,
    options: statusOptions,
    example: 'Public',
    evolves: true,
  },
  {
    key: 'direction',
    label: 'DRENA',
    kind: 'direction',
    required: true,
    hint: 'Nom exact de la direction régionale, tel qu’il est enregistré dans la plateforme.',
    example: 'DRENA Abidjan 1',
  },
  { key: 'locality', label: 'Localité', kind: 'text', required: true, example: 'Yopougon' },
  {
    key: 'municipality',
    label: 'Commune ou sous-préfecture',
    kind: 'text',
    required: false,
    example: 'Yopougon',
  },
  {
    key: 'managerName',
    label: 'Responsable',
    kind: 'text',
    required: true,
    hint: 'Nom du chef d’établissement ou du responsable du centre.',
    example: 'Mme Koné Aya',
    evolves: true,
  },
  {
    key: 'phone',
    label: 'Téléphone',
    kind: 'phone',
    required: true,
    hint: '10 chiffres, par exemple 07 08 09 10 11.',
    example: '0708091011',
    evolves: true,
  },
  { key: 'email', label: 'E-mail', kind: 'email', required: false, example: '', evolves: true },
  {
    key: 'openedYear',
    label: 'Année d’ouverture',
    kind: 'year',
    required: false,
    example: '1998',
  },
];

const classCount: EstablishmentField = {
  key: 'classCount',
  label: 'Nombre de classes',
  kind: 'number',
  required: false,
  example: '12',
  evolves: true,
};

/** Champs propres à chaque catégorie. */
export const CATEGORY_ESTABLISHMENT_FIELDS: Record<
  EstablishmentCategory,
  readonly EstablishmentField[]
> = {
  preschool: [
    {
      key: 'sections',
      label: 'Sections ouvertes',
      kind: 'choices',
      required: true,
      options: PRESCHOOL_SECTIONS,
      hint: 'Dans le fichier, séparez-les par des points-virgules ou des virgules.',
      example: 'Petite section, Moyenne section, Grande section',
      evolves: true,
    },
    { key: 'iepp', label: 'IEPP', kind: 'text', required: false, example: 'IEPP Yopougon 2' },
  ],
  primary: [
    {
      key: 'iepp',
      label: 'IEPP',
      kind: 'text',
      required: true,
      hint: 'Inspection de l’enseignement préscolaire et primaire.',
      example: 'IEPP Yopougon 2',
    },
    classCount,
  ],
  college: [classCount],
  lycee: [
    {
      key: 'series',
      label: 'Séries proposées',
      kind: 'list',
      required: false,
      hint: 'Séparez-les par des virgules : A, C, D…',
      example: 'A, C, D',
      evolves: true,
    },
    classCount,
  ],
  literacy_center: [
    {
      key: 'operator',
      label: 'Opérateur ou structure porteuse',
      kind: 'text',
      required: true,
      hint: 'ONG, association, mairie ou ministère qui porte le centre.',
      example: 'ONG Lire Ensemble',
      evolves: true,
    },
    {
      key: 'languages',
      label: 'Langues d’enseignement',
      kind: 'list',
      required: false,
      example: 'Français, Dioula',
      evolves: true,
    },
  ],
  technical_center: [
    {
      key: 'tracks',
      label: 'Filières ou spécialités',
      kind: 'list',
      required: true,
      hint: 'Séparez-les par des virgules.',
      example: 'Électricité, Mécanique auto',
      evolves: true,
    },
    {
      key: 'form',
      label: 'Forme',
      kind: 'text',
      required: false,
      hint: 'Lycée professionnel, centre de formation, atelier…',
      example: 'Lycée professionnel',
    },
  ],
};

export function establishmentFields(category: EstablishmentCategory): EstablishmentField[] {
  return [...COMMON_ESTABLISHMENT_FIELDS, ...CATEGORY_ESTABLISHMENT_FIELDS[category]];
}

/** Clés rangées dans les colonnes de la table ; les autres vont dans `details`. */
export const ESTABLISHMENT_COLUMN_KEYS = [
  'name',
  'officialCode',
  'status',
  'direction',
  'locality',
  'municipality',
  'managerName',
  'phone',
  'email',
  'openedYear',
] as const;

/** Valeur prête à enregistrer : texte, nombre ou liste. */
export type EstablishmentValue = string | number | string[];

export interface EstablishmentFieldError {
  field: string;
  label: string;
  value: string;
  message: string;
}

const deaccent = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'");

const splitList = (raw: string) =>
  raw
    .split(/[;,]/)
    .map((v) => v.trim().replace(/\s+/g, ' '))
    .filter((v) => v !== '');

function matchOption(field: EstablishmentField, raw: string): string | null {
  const wanted = deaccent(raw);
  const found = field.options?.find(
    (o) => deaccent(o.value) === wanted || deaccent(o.label) === wanted,
  );
  return found?.value ?? null;
}

/** Normalise un numéro ivoirien : 10 chiffres, l'indicatif +225 est retiré. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\s.\-()/]/g, '');
  if (digits.startsWith('+225')) digits = digits.slice(4);
  else if (digits.startsWith('00225')) digits = digits.slice(5);
  return /^\d{10}$/.test(digits) ? digits : null;
}

/**
 * Contrôle un champ saisi (formulaire ou cellule de fichier). Renvoie la valeur prête, `null`
 * si le champ est vide et facultatif, ou un message d'erreur. Le champ DRENA est contrôlé par
 * l'API (il faut la base), ici seulement sa présence.
 */
export function checkEstablishmentField(
  field: EstablishmentField,
  rawValue: string,
  now = new Date(),
): { value: EstablishmentValue | null } | { error: string } {
  const raw = rawValue.trim().replace(/\s+/g, ' ');
  if (raw === '') return field.required ? { error: 'Obligatoire.' } : { value: null };
  switch (field.kind) {
    case 'text':
    case 'direction':
      if (raw.length < 2) return { error: 'Trop court (2 caractères au moins).' };
      if (raw.length > 160) return { error: 'Trop long (160 caractères au plus).' };
      if (field.key === 'name' && raw.length < 3) {
        return { error: 'Trop court (3 caractères au moins).' };
      }
      return { value: raw };
    case 'number': {
      if (!/^\d+$/.test(raw)) return { error: 'Doit être un nombre entier.' };
      const n = Number(raw);
      if (n < 1 || n > 500) return { error: 'Doit être entre 1 et 500.' };
      return { value: n };
    }
    case 'year': {
      const max = now.getFullYear();
      if (!/^\d{4}$/.test(raw) || Number(raw) < 1900 || Number(raw) > max) {
        return { error: `Année sur 4 chiffres, entre 1900 et ${max}.` };
      }
      return { value: Number(raw) };
    }
    case 'phone': {
      const phone = normalizePhone(raw);
      return phone ? { value: phone } : { error: '10 chiffres attendus, par exemple 0708091011.' };
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.length <= 160
        ? { value: raw.toLowerCase() }
        : { error: 'Adresse e-mail mal formée.' };
    case 'choice': {
      const value = matchOption(field, raw);
      if (value) return { value };
      return {
        error: `Valeur inconnue. Valeurs possibles : ${field.options!.map((o) => o.label).join(', ')}.`,
      };
    }
    case 'choices': {
      const parts = splitList(raw);
      const values: string[] = [];
      for (const part of parts) {
        const value = matchOption(field, part);
        if (!value) {
          return {
            error: `« ${part} » inconnu. Valeurs possibles : ${field.options!.map((o) => o.label).join(', ')}.`,
          };
        }
        if (!values.includes(value)) values.push(value);
      }
      if (values.length === 0 && field.required) return { error: 'Obligatoire.' };
      return { value: values };
    }
    case 'list': {
      const values = [...new Set(splitList(raw))];
      if (values.some((v) => v.length > 80)) return { error: 'Un élément dépasse 80 caractères.' };
      if (values.length > 30) return { error: '30 éléments au plus.' };
      return values.length > 0
        ? { value: values }
        : field.required
          ? { error: 'Obligatoire.' }
          : { value: null };
    }
  }
}

/** Contrôle toute une fiche ; `values` ne contient que les champs remplis et valides. */
export function checkEstablishment(
  category: EstablishmentCategory,
  raw: Record<string, string | undefined>,
): { values: Record<string, EstablishmentValue>; errors: EstablishmentFieldError[] } {
  const values: Record<string, EstablishmentValue> = {};
  const errors: EstablishmentFieldError[] = [];
  for (const field of establishmentFields(category)) {
    const input = raw[field.key] ?? '';
    const result = checkEstablishmentField(field, input);
    if ('error' in result) {
      errors.push({ field: field.key, label: field.label, value: input, message: result.error });
    } else if (result.value !== null) values[field.key] = result.value;
  }
  return { values, errors };
}

/** Texte lisible d'une valeur enregistrée (listes, choix). */
export function formatEstablishmentValue(
  field: EstablishmentField,
  value: EstablishmentValue | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';
  const label = (v: string) => field.options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(', ');
  return field.kind === 'choice' ? label(String(value)) : String(value);
}

/** En-tête d'une colonne du modèle : le libellé, suivi d'un astérisque s'il est obligatoire. */
export const templateHeader = (field: EstablishmentField) =>
  field.required ? `${field.label}*` : field.label;

/** Modèle d'import d'une catégorie : en-têtes puis une ligne d'exemple, séparateur « ; » (Excel). */
export function establishmentTemplate(category: EstablishmentCategory): string {
  const fields = establishmentFields(category);
  const escape = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    fields.map((f) => escape(templateHeader(f))).join(';'),
    fields.map((f) => escape(f.example)).join(';'),
  ].join('\r\n');
}

/** Retrouve le champ d'une colonne du fichier (sans accents, casse ni astérisque). */
export function fieldForHeader(
  category: EstablishmentCategory,
  header: string,
): EstablishmentField | null {
  const wanted = deaccent(header.replace(/\*/g, ''));
  return (
    establishmentFields(category).find(
      (f) => deaccent(f.label) === wanted || deaccent(f.key) === wanted,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------------------------
// Échanges avec l'API
// ---------------------------------------------------------------------------------------------

const Category = z.enum(ESTABLISHMENT_CATEGORIES);
/** Saisie brute du formulaire : l'API la contrôle avec `checkEstablishment`. */
const RawFields = z.record(z.string(), z.string().max(2000));

export const CreateEstablishmentSchema = z.object({
  category: Category,
  /** DRENA choisie dans la liste (identifiant) ; le champ texte « direction » sert à l'import. */
  parentId: z.uuid(),
  fields: RawFields,
});

export const UpdateEstablishmentSchema = z.object({
  fields: RawFields,
  /** Superadministrateur et administrateur : changer de catégorie ou de DRENA. */
  category: Category.optional(),
  parentId: z.uuid().optional(),
});

export const EstablishmentChangeSchema = z.object({
  field: z.string().min(1).max(40),
  value: z.string().max(2000),
  /** Date à laquelle le changement a eu lieu (pas dans le futur). */
  effectiveOn: z.iso.date(),
  note: z.string().trim().max(300).optional(),
});

export const ImportEstablishmentsSchema = z.object({
  category: Category,
  csv: z.string().min(1, 'Le fichier est vide.').max(500_000, 'Le fichier est trop gros.'),
  confirm: z.boolean(),
});

export interface EstablishmentImportAnomaly {
  /** Ligne du fichier (1 = en-têtes) ; 0 pour un défaut de structure. */
  line: number;
  column: string;
  value: string;
  message: string;
}

export interface EstablishmentImportResult {
  category: EstablishmentCategory;
  /** Lignes de données lues. */
  total: number;
  /** Lignes prêtes à créer. */
  ready: number;
  duplicates: Array<{ line: number; name: string; message: string }>;
  anomalies: EstablishmentImportAnomaly[];
  /** Établissements créés (0 tant que l'import n'est pas confirmé). */
  created: number;
  confirmed: boolean;
}

export interface EstablishmentChange {
  id: string;
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
  effectiveOn: string;
  note: string | null;
  author: string | null;
  createdAt: string;
}
