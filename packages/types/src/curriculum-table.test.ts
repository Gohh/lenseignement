import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CurriculumFileSchema } from './curriculum.js';
import { codeFromTitle, curriculumFromTable } from './curriculum-table.js';

const meta = {
  code: 'PRIMAIRE-CI',
  branch: 'primaire' as const,
  title: 'Programme du primaire',
  description: 'Programme de test.',
  label: '2026',
  sourceTitle: 'Note',
  sourceIssuer: 'Tests',
  isOfficial: false,
};

test('tableau Excel : niveaux, matières, codes fabriqués et prérequis par intitulé', () => {
  const csv = [
    '\uFEFFNiveau;Matière;Code;Compétence;Description;Prérequis',
    'CP1;Mathématiques;;Compter jusqu’à 20;;',
    'CP1;Mathématiques;;Additionner;Petits nombres;compter jusqu’à 20',
    'CP 2;Français;FR-01;Lire des syllabes;;',
    '"CP 2";Français;fr 02;"Lire des mots; simples";;FR-01, Additionner',
  ].join('\r\n');
  const { file, errors } = curriculumFromTable(csv, meta);
  assert.deepEqual(errors, []);
  const parsed = CurriculumFileSchema.parse(file);
  assert.deepEqual(
    parsed.levels.map((l) => l.code),
    ['CP1', 'CP-2'],
  );
  assert.deepEqual(
    parsed.subjects.map((s) => s.code),
    ['MATHEMATIQUES', 'FRANCAIS'],
  );
  assert.deepEqual(
    parsed.competencies.map((c) => [c.code, c.prerequisites]),
    [
      ['MATHEMATIQUES-01', []],
      ['MATHEMATIQUES-02', ['MATHEMATIQUES-01']],
      ['FR-01', []],
      ['FR-02', ['FR-01', 'MATHEMATIQUES-02']],
    ],
  );
  assert.equal(parsed.competencies[3]!.title, 'Lire des mots; simples');
  assert.equal(parsed.competencies[1]!.description, 'Petits nombres');
});

test('tableau Excel : erreurs lisibles', () => {
  assert.match(curriculumFromTable('a;b\n1;2', meta).errors[0]!, /titres des colonnes/);
  const { errors } = curriculumFromTable(
    'Niveau;Matière;Code;Compétence\nCP1;;;Compter\nCP1;Maths;M1;Lire\nCP1;Maths;M1;Écrire',
    meta,
  );
  assert.deepEqual(errors, [
    'Ligne 2 : il manque la matière.',
    'Ligne 4 : le code M1 est déjà pris par une autre compétence.',
  ]);
  assert.equal(codeFromTitle('Éveil au milieu'), 'EVEIL-AU-MILIEU');
});
