import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_CODES, LEVEL_GROUPS, levelBranch, levelLabel } from './levels.js';

test('chaque niveau appartient à un seul groupe, dans l’ordre de la liste', () => {
  const codes = LEVEL_GROUPS.flatMap((g) => g.levels.map((l) => l.code));
  assert.deepEqual(codes, [...LEVEL_CODES]);
});

test('noms complets et espaces des niveaux', () => {
  assert.equal(levelLabel('mat-1'), 'Maternelle 1re section');
  assert.equal(levelLabel('cp1'), 'Primaire CP1');
  assert.equal(levelLabel('tle'), 'Lycée Terminale');
  assert.equal(levelLabel('alpha-3'), 'Alphabétisation Niveau 3');
  assert.equal(levelLabel('inconnu'), null);
  assert.equal(levelBranch('6e'), 'secondaire');
  assert.equal(levelBranch('mat-2'), 'primaire');
});
