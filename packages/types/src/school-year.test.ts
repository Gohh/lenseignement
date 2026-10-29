import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateCohortSchema, schoolYearChoices, schoolYearOf } from './cohorts.js';

test('année scolaire : de septembre à août, trois choix à la création', () => {
  assert.equal(schoolYearOf(new Date(2026, 8, 1)), '2026-2027');
  assert.equal(schoolYearOf(new Date(2027, 7, 31)), '2026-2027');
  assert.deepEqual(schoolYearChoices(new Date(2026, 9, 29)), [
    '2025-2026',
    '2026-2027',
    '2027-2028',
  ]);
  assert.equal(CreateCohortSchema.shape.schoolYear.safeParse('2026-2028').success, false);
  assert.equal(CreateCohortSchema.shape.schoolYear.safeParse('2026-2027').success, true);
});
