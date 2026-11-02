import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OralPartSchema, oralReferencePart, scoreOralPart, type OralPartAnswer } from './oral.js';

const grid = OralPartSchema.parse({
  kind: 'grille',
  title: 'Sons',
  items: Array.from({ length: 50 }, (_, i) => `s${i}`),
});
const text = OralPartSchema.parse({
  kind: 'texte',
  title: 'Texte',
  text: 'un deux trois quatre cinq six sept huit neuf dix',
  questions: [
    { prompt: 'Q1', answer: '' },
    { prompt: 'Q2', answer: '' },
  ],
  seconds: 60,
  reference: true,
});
const answer = (over: Partial<OralPartAnswer>): OralPartAnswer => ({
  errors: [],
  last: null,
  seconds: 0,
  stopped: false,
  answers: [],
  ...over,
});

test('justes par minute : lus jusqu’au dernier, moins les erreurs, rapportés à la minute', () => {
  const full = scoreOralPart(grid, answer({ errors: [3, 4, 45], last: 29, seconds: 60 }));
  assert.deepEqual([full.correct, full.perMinute, full.stopped], [28, 28, false]);
  // Fini en 30 secondes : le score est ramené à la minute.
  const fast = scoreOralPart(text, answer({ last: 9, seconds: 30, answers: [1, 0] }));
  assert.deepEqual([fast.correct, fast.perMinute, fast.questionsCorrect], [10, 20, 1]);
});

test('règle d’arrêt : tout faux sur les 10 premiers compte 0', () => {
  const stopped = scoreOralPart(
    grid,
    answer({ errors: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], last: 15, seconds: 60 }),
  );
  assert.deepEqual([stopped.correct, stopped.perMinute, stopped.stopped], [0, 0, true]);
  assert.equal(scoreOralPart(grid, answer({})).perMinute, 0);
});

test('partie de référence : celle marquée, sinon la première chronométrée', () => {
  assert.equal(oralReferencePart([grid, text]), 1);
  assert.equal(oralReferencePart([grid, { ...text, reference: false }]), 0);
});

test('un texte de moins de 5 mots est refusé', () => {
  assert.equal(OralPartSchema.safeParse({ ...text, text: 'trop court' }).success, false);
});
