import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAchievements } from './achievements.js';
import type { AssignmentItem } from './assignments.js';
import type { LearningPlanItem } from './learning.js';

const course = (completed: number[], finished: boolean): LearningPlanItem => ({
  courseId: 'c',
  enrolled: true,
  total: 3,
  completed,
  resumeAt: null,
  finished,
  title: 'Cours',
  branch: 'x',
  enrolledAt: '2026-01-01T00:00:00Z',
});

const homework = (score: number | null, max = 20): AssignmentItem => ({
  id: 'a',
  cohortId: 'k',
  cohortName: 'CM1',
  title: 'Rédaction',
  instructions: 'x',
  dueAt: null,
  maxScore: max,
  createdAt: '2026-01-01T00:00:00Z',
  teacherName: null,
  canManage: false,
  mine: {
    id: 's',
    body: 'x',
    submittedAt: '2026-01-02T00:00:00Z',
    score,
    comment: null,
    gradedAt: null,
  },
  learnerCount: 0,
  submittedCount: 0,
  gradedCount: 0,
});

const earned = (plan: LearningPlanItem[], list: AssignmentItem[]) =>
  computeAchievements(plan, list)
    .badges.filter((b) => b.earned)
    .map((b) => b.code);

test('sans activité, aucun badge', () => {
  assert.deepEqual(earned([], []), []);
});

test('leçons et cours terminés', () => {
  assert.deepEqual(earned([course([1], false)], []), ['premiere-lecon']);
  assert.deepEqual(earned([course([1, 2, 3], true)], []), ['premiere-lecon', 'cours-termine']);
});

test('devoir rendu puis bonne note', () => {
  assert.deepEqual(earned([], [homework(null)]), ['premier-devoir']);
  assert.deepEqual(earned([], [homework(14)]), ['premier-devoir']);
  assert.deepEqual(earned([], [homework(15)]), ['premier-devoir', 'bonne-note']);
  assert.deepEqual(earned([], [homework(8, 10)]), ['premier-devoir', 'bonne-note']);
});

test('un devoir à corriger côté enseignant ne compte pas', () => {
  const teacher = { ...homework(null), canManage: true };
  assert.deepEqual(earned([], [teacher]), []);
});
