import assert from 'node:assert/strict';
import { test } from 'node:test';
import { circuitSteps, type CircuitInput } from './circuit.js';

const base: CircuitInput = {
  status: 'draft',
  title: 'Compter au marché',
  summary: '',
  audience: '',
  curriculum: null,
  modules: [],
};
const states = (v: CircuitInput) => circuitSteps(v).map((s) => s.state);

test('un brouillon vide commence au plan', () => {
  assert.deepEqual(states(base), ['current', 'todo', 'todo', 'todo', 'todo', 'todo']);
  assert.match(circuitSteps(base)[0]!.todo, /titre/);
});

test('on avance dans l’ordre : plan, modules, références, leçons', () => {
  const plan = { ...base, summary: 'Un résumé', audience: 'CP1' };
  assert.deepEqual(states(plan), ['done', 'current', 'todo', 'todo', 'todo', 'todo']);
  const modules = { ...plan, modules: [{ lessons: [] }] };
  assert.deepEqual(states(modules), ['done', 'done', 'current', 'todo', 'todo', 'todo']);
  const refs = { ...modules, curriculum: { competencies: [{}] } };
  assert.deepEqual(states(refs), ['done', 'done', 'done', 'current', 'todo', 'todo']);
  const lessons = { ...refs, modules: [{ lessons: [{ body: 'Texte' }] }] };
  assert.deepEqual(states(lessons), ['done', 'done', 'done', 'done', 'current', 'todo']);
});

test('on ne saute pas une étape : des leçons sans module ni plan ne comptent pas', () => {
  const lessonsOnly = { ...base, modules: [{ lessons: [{ body: 'Texte' }] }] };
  assert.deepEqual(states(lessonsOnly), ['current', 'todo', 'todo', 'todo', 'todo', 'todo']);
});

test('relecture, approbation, publication', () => {
  const full = { ...base, summary: 's', audience: 'a' };
  assert.deepEqual(states({ ...full, status: 'in_review' }), [
    'done',
    'done',
    'done',
    'done',
    'current',
    'todo',
  ]);
  assert.deepEqual(states({ ...full, status: 'approved' }), [
    'done',
    'done',
    'done',
    'done',
    'done',
    'current',
  ]);
  assert.deepEqual(states({ ...full, status: 'published' }), Array(6).fill('done'));
});
