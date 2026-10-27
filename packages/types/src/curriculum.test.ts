import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CurriculumFileSchema, findPrerequisiteCycle } from './curriculum.js';

const valid = {
  curriculum: { code: 'DEMO', branch: 'primaire', title: 'Démo', description: 'Fictif' },
  version: {
    label: '2026',
    source: { title: 'Source fictive', issuer: 'Équipe projet', isOfficial: false },
  },
  levels: [{ code: 'CP1', title: 'CP1' }],
  subjects: [{ code: 'LECT', title: 'Lecture' }],
  competencies: [
    { code: 'L1', title: 'Reconnaître les lettres', subject: 'LECT', level: 'CP1' },
    { code: 'L2', title: 'Lire des syllabes', subject: 'LECT', prerequisites: ['L1'] },
  ],
};

test('un fichier de programme valide est accepté', () => {
  const parsed = CurriculumFileSchema.parse(valid);
  assert.deepEqual(parsed.competencies[0]?.prerequisites, []);
});

test('les références inconnues et les codes en double sont refusés', () => {
  const result = CurriculumFileSchema.safeParse({
    ...valid,
    competencies: [
      ...valid.competencies,
      { code: 'L2', title: 'Doublon', subject: 'MATH', level: 'CE9', prerequisites: ['X'] },
    ],
  });
  assert.equal(result.success, false);
  const messages = result.error!.issues.map((i) => i.message);
  for (const expected of [
    'Code en double : L2',
    'Matière inconnue : MATH',
    'Niveau inconnu : CE9',
    'Prérequis inconnu : X',
  ]) {
    assert.ok(messages.includes(expected), expected);
  }
});

test('une boucle de prérequis est détectée et décrite', () => {
  assert.deepEqual(
    findPrerequisiteCycle([
      { code: 'A', prerequisites: ['C'] },
      { code: 'B', prerequisites: ['A'] },
      { code: 'C', prerequisites: ['B'] },
    ]),
    ['A', 'C', 'B', 'A'],
  );
  assert.equal(findPrerequisiteCycle([{ code: 'A', prerequisites: [] }]), null);
  const result = CurriculumFileSchema.safeParse({
    ...valid,
    competencies: [
      { code: 'L1', title: 'x', subject: 'LECT', prerequisites: ['L2'] },
      { code: 'L2', title: 'y', subject: 'LECT', prerequisites: ['L1'] },
    ],
  });
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0]!.message, /Prérequis en boucle/);
});
