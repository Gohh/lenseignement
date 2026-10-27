import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApproveSchema, REVIEW_CHECKS, ReasonSchema } from './course.js';

test('l’approbation exige les trois contrôles cochés', () => {
  const all = { pedagogy: true, accessibility: true, rights: true };
  assert.equal(Object.keys(REVIEW_CHECKS).length, 3);
  assert.ok(ApproveSchema.safeParse({ checklist: all }).success);
  for (const key of Object.keys(all)) {
    const result = ApproveSchema.safeParse({ checklist: { ...all, [key]: false } });
    assert.equal(result.success, false);
  }
});

test('une demande de modifications ou un retrait exige un motif', () => {
  assert.equal(ReasonSchema.safeParse({ comment: '  court  ' }).success, false);
  assert.ok(ReasonSchema.safeParse({ comment: 'Ajoutez une leçon sur les pièces.' }).success);
});
