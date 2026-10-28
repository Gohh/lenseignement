import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_IDS as ID } from '../src/db/demo-data.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

const get = (path: string, status = 200) =>
  request(ctx.app.getHttpServer()).get(`/api/v1/catalog/courses${path}`).expect(status);

const titles = (body: { items: Array<{ title: string }> }) => body.items.map((i) => i.title).sort();

test('le catalogue est public et ne montre que les versions publiées', async () => {
  const res = await get('');
  assert.deepEqual(titles(res.body), [
    'Additionner jusqu’à 10 (démonstration)',
    'Des lettres aux syllabes (démonstration)',
    'Les nombres jusqu’à 50 (démonstration)',
    'Lire des mots courts (démonstration)',
  ]);
  assert.equal(res.body.total, 4);
  assert.equal(res.body.page, 1);
  // Ni brouillon (M. Koffi) ni cours en relecture (Mme Aminata).
  await get(`/${ID.courseSyllabes}`, 404);
  await get(`/${ID.courseMarche}`, 404);
  await get('/pas-un-id', 404);
});

test('aucune donnée personnelle dans le catalogue', async () => {
  const res = await get(`/${ID.courseNombres}`);
  const text = JSON.stringify(res.body);
  for (const name of ['Koffi', 'Mariam', 'Bamba', ID.userKoffi, ID.userMariam]) {
    assert.ok(!text.includes(name), `${name} ne doit pas apparaître`);
  }
  assert.equal(res.body.organization, 'École primaire Les Manguiers (fictive)');
  assert.deepEqual(res.body.curriculum, { code: 'DEMO-PRIMAIRE', label: '2026' });
  assert.deepEqual(
    res.body.competencies.map((c: { code: string }) => c.code),
    ['CALC-01', 'CALC-02'],
  );
  assert.equal(res.body.lessonCount, 2);
  assert.equal(res.body.modules[0].lessons[0].title, 'Compter de 10 en 10');
  assert.equal(res.body.modules[0].lessons[0].body, undefined);
});

test('filtres : espace, recherche et compétence', async () => {
  assert.deepEqual(titles((await get('?branch=primaire')).body).length, 4);
  assert.deepEqual((await get('?branch=technique')).body.items, []);
  assert.deepEqual(titles((await get('?q=MOTS')).body), ['Lire des mots courts (démonstration)']);
  assert.deepEqual(titles((await get('?q=additionner')).body), [
    'Additionner jusqu’à 10 (démonstration)',
    'Les nombres jusqu’à 50 (démonstration)',
  ]);
  // Les caractères spéciaux sont cherchés tels quels.
  assert.deepEqual((await get('?q=%25')).body.items, []);
  assert.deepEqual(titles((await get('?competency=LECT-03')).body), [
    'Lire des mots courts (démonstration)',
  ]);
  const facets = (await get('?branch=primaire')).body.competencies;
  assert.deepEqual(
    facets.map((c: { code: string }) => c.code),
    ['CALC-01', 'CALC-02', 'LECT-01', 'LECT-02', 'LECT-03'],
  );
});

test('paramètres invalides refusés', async () => {
  await get('?branch=inconnue', 400);
  await get('?competency=<script>', 400);
  await get('?page=0', 400);
  assert.deepEqual((await get('?page=2')).body.items, []);
});

test('lecteur : leçon publiée repérée par son rang, avec précédente et suivante', async () => {
  const first = await get(`/${ID.courseNombres}/lessons/1`);
  assert.equal(first.body.title, 'Compter de 10 en 10');
  assert.match(first.body.body, /bâtonnets/);
  assert.equal(first.body.total, 2);
  assert.deepEqual(first.body.module, { number: 1, title: 'Compter et additionner' });
  assert.equal(first.body.previous, null);
  assert.equal(first.body.next, 2);
  const second = await get(`/${ID.courseNombres}/lessons/2`);
  assert.equal(second.body.previous, 1);
  assert.equal(second.body.next, null);
  assert.equal(JSON.stringify(second.body).includes(ID.userKoffi), false);

  await get(`/${ID.courseNombres}/lessons/3`, 404);
  await get(`/${ID.courseNombres}/lessons/0`, 404);
  await get(`/${ID.courseNombres}/lessons/abc`, 404);
  // Le contenu d'un brouillon ou d'un cours en relecture n'est jamais servi.
  await get(`/${ID.courseSyllabes}/lessons/1`, 404);
  await get(`/${ID.courseMarche}/lessons/1`, 404);
});
