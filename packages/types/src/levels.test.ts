import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_CODES, LEVEL_GROUPS, levelBranch, levelLabel, nextLevel } from './levels.js';

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

test('niveau suivant : dans le parcours, d’un cycle à l’autre, et fin de parcours', () => {
  assert.equal(nextLevel('cp1'), 'cp2');
  assert.equal(nextLevel('mat-3'), 'cp1');
  assert.equal(nextLevel('cm2'), '6e');
  assert.equal(nextLevel('3e'), '2nde');
  assert.equal(nextLevel('tle'), null);
  assert.equal(nextLevel('alpha-1'), 'alpha-2');
  assert.equal(nextLevel('alpha-3'), null);
  assert.equal(nextLevel('inconnu'), null);
});
