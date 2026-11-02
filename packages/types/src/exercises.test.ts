import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ExerciseContentSchema,
  exercisePlay,
  exerciseShuffle,
  gradeExercise,
  normalizeAnswer,
  parseNumber,
  type ExerciseContent,
} from './exercises.js';

const content = (input: unknown): ExerciseContent => ExerciseContentSchema.parse(input);
const answer = (choices: number[] = [], texts: string[] = []) => ({ choices, texts });

test('mélange fixe, jamais l’ordre de départ', () => {
  for (let n = 2; n <= 8; n += 1) {
    const order = exerciseShuffle(n);
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      [...Array(n).keys()],
    );
    assert.notDeepEqual(order, [...Array(n).keys()]);
    assert.deepEqual(exerciseShuffle(n), order);
  }
});

test('réponses écrites : accents, majuscules, nombres à la française', () => {
  assert.equal(normalizeAnswer('  Élève. '), 'eleve');
  assert.equal(parseNumber('1 250,5'), 1250.5);
  assert.equal(parseNumber('413'), 413);
  assert.equal(parseNumber('quatre'), null);
});

test('choix multiple et vrai ou faux', () => {
  const c = content({ kind: 'choice', prompt: '2 + 2 ?', choices: ['3', '4'], correct: 1 });
  assert.equal(gradeExercise(c, answer([1])).correct, true);
  assert.equal(gradeExercise(c, answer([0])).score, 0);
  const tf = content({ kind: 'truefalse', prompt: 'Le soleil est une étoile.', correct: true });
  assert.equal(gradeExercise(tf, answer([0])).correct, true);
  assert.equal(gradeExercise(tf, answer([1])).correct, false);
  assert.ok(!('correct' in exercisePlay(c)));
});

test('texte à trous : plusieurs réponses acceptées, points partiels', () => {
  const c = content({
    kind: 'gaps',
    prompt: 'Complète.',
    text: 'Le [[chat|chaton]] boit du [[lait]].',
    explanation: 'Le chat boit du lait.',
  });
  const play = exercisePlay(c);
  assert.deepEqual(play.kind === 'gaps' && play.parts, ['Le ', ' boit du ', '.']);
  assert.equal(gradeExercise(c, answer([], ['Chaton', 'LAIT'])).correct, true);
  const half = gradeExercise(c, answer([], ['chien', 'lait']));
  assert.equal(half.score, 0.5);
  assert.deepEqual(half.feedback, ['Trou n° 1 : à revoir.', 'Le chat boit du lait.']);
  assert.throws(() => content({ kind: 'gaps', prompt: 'x', text: 'sans trou' }));
});

test('relier et remettre dans l’ordre (ordre affiché mélangé)', () => {
  const m = content({
    kind: 'match',
    prompt: 'Relie.',
    pairs: [
      { left: '2 × 3', right: '6' },
      { left: '2 × 5', right: '10' },
      { left: '2 × 7', right: '14' },
    ],
  });
  const play = exercisePlay(m);
  assert.ok(play.kind === 'match');
  const picks = play.lefts.map((_, i) =>
    play.rights.indexOf(m.kind === 'match' ? m.pairs[i]!.right : ''),
  );
  assert.equal(gradeExercise(m, answer(picks)).correct, true);
  assert.equal(gradeExercise(m, answer([0, 0, 0])).correct, false);

  const o = content({ kind: 'order', prompt: 'Range.', items: ['12', '45', '310'] });
  const shown = exercisePlay(o);
  assert.ok(shown.kind === 'order');
  const right = ['12', '45', '310'].map((v) => shown.items.indexOf(v));
  assert.equal(gradeExercise(o, answer(right)).correct, true);
  assert.equal(gradeExercise(o, answer([...right].reverse())).correct, false);
});

test('calcul à saisir avec écart accepté, lecture avec plusieurs questions', () => {
  const n = content({ kind: 'number', prompt: '245 + 168 ?', answer: 413, unit: 'mangues' });
  assert.equal(gradeExercise(n, answer([], ['413'])).correct, true);
  assert.equal(gradeExercise(n, answer([], ['412'])).correct, false);
  assert.deepEqual(gradeExercise(n, answer([], ['abc'])).feedback, ['Écris un nombre.']);
  const t = content({ kind: 'number', prompt: 'π ?', answer: 3.14, tolerance: 0.01 });
  assert.equal(gradeExercise(t, answer([], ['3,15'])).correct, true);

  const r = content({
    kind: 'reading',
    prompt: 'Lis le texte.',
    passage: 'Awa va au marché.',
    questions: [
      { prompt: 'Qui ?', choices: ['Awa', 'Koffi'], correct: 0 },
      { prompt: 'Où ?', choices: ['À l’école', 'Au marché'], correct: 1 },
    ],
  });
  assert.equal(gradeExercise(r, answer([0, 1])).correct, true);
  assert.equal(gradeExercise(r, answer([0, 0])).score, 0.5);
});

test('image ou son : le fichier est obligatoire', () => {
  assert.throws(() =>
    content({ kind: 'media', prompt: 'Écoute.', choices: ['a', 'b'], correct: 0 }),
  );
  const ok = content({
    kind: 'media',
    prompt: 'Écoute.',
    choices: ['a', 'b'],
    correct: 0,
    media: { key: 'a'.repeat(32), type: 'audio', alt: '' },
  });
  assert.equal(gradeExercise(ok, answer([0])).correct, true);
});
