import assert from 'node:assert/strict';
import { test } from 'node:test';
import { learnerUsername, parseLearnerList } from './cohorts.js';

test('liste d’élèves : « Nom ; Prénom » par défaut, en-tête reconnu, lignes vides ignorées', () => {
  const plain = parseLearnerList('KONÉ;Awa\n\nTRAORÉ ; Moussa Ali\n');
  assert.deepEqual(plain.learners, [
    { lastName: 'KONÉ', firstName: 'Awa' },
    { lastName: 'TRAORÉ', firstName: 'Moussa Ali' },
  ]);
  assert.deepEqual(plain.errors, []);

  // Fichier Excel : en-tête « Prénom,Nom », marque BOM, guillemets.
  const csv = parseLearnerList('\uFEFFPrénom,Nom\r\n"Fatou","Bamba"\r\nYao,Kouadio\r\n');
  assert.deepEqual(csv.learners, [
    { firstName: 'Fatou', lastName: 'Bamba' },
    { firstName: 'Yao', lastName: 'Kouadio' },
  ]);

  // Sans séparateur : le premier mot est le nom.
  assert.deepEqual(parseLearnerList('KOUASSI Marie Laure').learners, [
    { lastName: 'KOUASSI', firstName: 'Marie Laure' },
  ]);

  const bad = parseLearnerList('Seul\nDIABATÉ;Ibrahim');
  assert.equal(bad.learners.length, 1);
  assert.match(bad.errors[0]!, /Ligne 1/);
});

test('identifiant d’élève : sans accents, prénom.nom', () => {
  assert.equal(learnerUsername({ firstName: 'Awa Marie', lastName: 'Koné' }), 'awa.kone');
  assert.equal(
    learnerUsername({ firstName: "N'Guessan", lastName: 'Yao-Brou' }),
    'nguessan.yaobrou',
  );
});
