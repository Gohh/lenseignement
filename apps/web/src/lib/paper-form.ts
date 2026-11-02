const ID = /^[0-9a-f-]{36}$/i;

/** Grille papier : « Copie » cochée = copie rendue ; chaque case cochée = réponse juste. */
export function paperRows(
  form: FormData,
): Array<{ learnerId: string; marks: Array<0 | 1> | null }> {
  const count = Math.min(
    Math.max(Number.parseInt(String(form.get('count') ?? ''), 10) || 0, 0),
    40,
  );
  return form
    .getAll('learners')
    .map(String)
    .filter((l) => ID.test(l))
    .map((learnerId) => {
      const marks = Array.from({ length: count }, (_, i) =>
        form.get(`m:${learnerId}:${i}`) ? (1 as const) : (0 as const),
      );
      const handedIn = Boolean(form.get(`copie:${learnerId}`)) || marks.some((m) => m === 1);
      return { learnerId, marks: handedIn ? marks : null };
    });
}
