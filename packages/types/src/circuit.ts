/** Circuit de création d'un cours : six étapes, dans l'ordre (ADR-022). */
export const CIRCUIT_STEPS = [
  { key: 'plan', title: 'Plan', anchor: '#informations' },
  { key: 'modules', title: 'Modules', anchor: '#plan' },
  { key: 'references', title: 'Références', anchor: '#informations' },
  { key: 'lecons', title: 'Leçons et quiz', anchor: '#plan' },
  { key: 'relecture', title: 'Relecture', anchor: '#validation' },
  { key: 'publication', title: 'Publication', anchor: '#validation' },
] as const;

export type CircuitKey = (typeof CIRCUIT_STEPS)[number]['key'];

/** Ce qu'il faut de la version pour situer le cours dans le circuit. */
export interface CircuitInput {
  status: string;
  title: string;
  summary: string;
  audience: string;
  curriculum: { competencies: unknown[] } | null;
  modules: Array<{ lessons: Array<{ body: string }> }>;
}

export interface CircuitStep {
  key: CircuitKey;
  title: string;
  anchor: string;
  state: 'done' | 'current' | 'todo';
  /** Ce qu'il reste à faire pour cette étape (vide quand elle est faite). */
  todo: string;
}

/** Texte de ce qui manque à une étape de rédaction ; vide si elle est faite. */
function missing(key: CircuitKey, v: CircuitInput): string {
  switch (key) {
    case 'plan':
      return v.title.trim().length >= 3 && v.summary.trim() && v.audience.trim()
        ? ''
        : 'Renseigner le titre, le résumé et le public visé.';
    case 'modules':
      return v.modules.length > 0 ? '' : 'Ajouter au moins un module au plan.';
    case 'references':
      return v.curriculum && v.curriculum.competencies.length > 0
        ? ''
        : 'Choisir le programme de référence et cocher les compétences visées.';
    case 'lecons':
      return v.modules.length > 0 &&
        v.modules.every((m) => m.lessons.length > 0 && m.lessons.every((l) => l.body.trim() !== ''))
        ? ''
        : 'Écrire au moins une leçon dans chaque module.';
    default:
      return '';
  }
}

/**
 * Situe un cours dans le circuit. Un brouillon avance étape par étape : la première étape non
 * faite est « en cours » et les suivantes restent « à venir » ; en relecture, puis approuvée, la
 * version est à l'étape 5 puis 6 ; publiée, tout est fait.
 */
export function circuitSteps(version: CircuitInput): CircuitStep[] {
  const writing: CircuitKey[] = ['plan', 'modules', 'references', 'lecons'];
  const doneKeys = new Set<CircuitKey>();
  const status = version.status;
  if (status === 'draft') {
    for (const key of writing) {
      if (missing(key, version)) break;
      doneKeys.add(key);
    }
  } else {
    for (const key of writing) doneKeys.add(key);
    if (status === 'approved' || status === 'published' || status === 'archived') {
      doneKeys.add('relecture');
    }
    if (status === 'published' || status === 'archived') doneKeys.add('publication');
  }
  let currentTaken = false;
  return CIRCUIT_STEPS.map((step) => {
    const done = doneKeys.has(step.key);
    const current = !done && !currentTaken;
    if (current) currentTaken = true;
    const todo = done
      ? ''
      : step.key === 'relecture'
        ? 'Envoyer le cours en relecture, puis attendre l’avis du référent.'
        : step.key === 'publication'
          ? 'Faire publier le cours par une deuxième personne.'
          : status === 'draft'
            ? missing(step.key, version)
            : '';
    return { ...step, state: done ? 'done' : current ? 'current' : 'todo', todo };
  });
}
