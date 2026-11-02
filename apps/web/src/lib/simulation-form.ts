import type { SimulationSubmission } from '@lenseignement/types';

/**
 * Réponses du formulaire d'atelier (page en ligne et atelier gardé hors ligne). Champs :
 * `s:<étape>` (étape présente), `i:<étape>:<question>` (choix), `e:<étape>` (équipements cochés),
 * `o:<étape>:<place>` (geste à cette place), `h:<étape>` (score de l'exercice H5P, en %).
 */
export function simulationSubmission(form: FormData): SimulationSubmission {
  const steps = new Map<string, Array<[number, number]>>();
  for (const [name, value] of form.entries()) {
    const [kind, stepId, index] = name.split(':');
    if (!stepId || !['s', 'i', 'e', 'o', 'h'].includes(kind!)) continue;
    const list = steps.get(stepId) ?? [];
    steps.set(stepId, list);
    if (kind === 's' || value === '') continue;
    list.push([kind === 'e' || kind === 'h' ? list.length : Number(index), Number(value)]);
  }
  return {
    attemptId: String(form.get('attemptId') ?? ''),
    steps: [...steps].map(([stepId, list]) => ({
      stepId,
      choices: list.sort((a, b) => a[0] - b[0]).map(([, choice]) => choice),
    })),
  };
}
