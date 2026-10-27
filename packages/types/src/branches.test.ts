import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRANCHES, BRANCH_CODES, BranchSchema } from './branches.js';

test('chaque branche déclarée est valide et unique', () => {
  for (const branch of BRANCHES) BranchSchema.parse(branch);
  assert.deepEqual(
    BRANCHES.map((b) => b.code),
    [...BRANCH_CODES],
  );
});
