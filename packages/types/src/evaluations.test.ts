import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weightedAverage } from './evaluations.js';

test('moyenne pondérée sur 20', () => {
  assert.equal(weightedAverage([]), null);
  assert.equal(weightedAverage([{ myScore: null, maxScore: 20, coefficient: 1 }]), null);
  assert.equal(weightedAverage([{ myScore: 15, maxScore: 20, coefficient: 1 }]), 15);
  // 8/10 vaut 16/20 ; coefficient 2 contre 12/20 coefficient 1 → (32 + 12) / 3
  assert.equal(
    weightedAverage([
      { myScore: 8, maxScore: 10, coefficient: 2 },
      { myScore: 12, maxScore: 20, coefficient: 1 },
    ]),
    14.67,
  );
});
