import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { pilotState } from '@lenseignement/types';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { periodWindow } from '../src/stats/pilotage.js';
import { createTestApp, type TestContext } from './helpers.js';

// Tableau de pilotage : mêmes règles que les statistiques (aucun nom, petits groupes masqués).

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

async function pilot(subject: string, query: string, status = 200) {
  const token = await ctx.sign({ sub: subject });
  return request(ctx.app.getHttpServer())
    .get(`/api/v1/stats/pilotage${query}`)
    .set('authorization', `Bearer ${token}`)
    .expect(status);
}

test('périodes et états', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  assert.equal(periodWindow('annee', now).from, '2026-09-01T00:00:00.000Z');
  assert.equal(
    periodWindow('annee', new Date('2027-03-01T00:00:00Z')).from,
    '2026-09-01T00:00:00.000Z',
  );
  assert.equal(periodWindow('annee', now).compare, false);
  assert.equal(periodWindow('7', now).from, '2026-10-25T12:00:00.000Z');
  assert.equal(pilotState(null), null);
  assert.equal(pilotState(49), 'alert');
  assert.equal(pilotState(50), 'watch');
  assert.equal(pilotState(65), 'ok');
});

test('la référente régionale voit sa région, ses écoles en lignes, sans aucun nom d’élève', async () => {
  const res = await pilot(SUB.mariam, '?periode=annee');
  const body = res.body;
  assert.equal(body.zone.id, ID.orgRegion);
  const ids = body.rows.map((r: { id: string }) => r.id);
  assert.ok(ids.includes(ID.orgManguiers));
  assert.ok(ids.includes(ID.orgBaobabs));
  assert.equal(body.weekly.length, 12);
  assert.equal(body.kpis.active.previous, null);
  const text = JSON.stringify(body);
  for (const name of ['Élève fictif', 'Awa', 'Koffi', 'Kouamé']) assert.ok(!text.includes(name));

  // Une école ouverte depuis la région ; une zone hors de portée est refusée.
  const school = (await pilot(SUB.mariam, `?zone=${ID.orgManguiers}&periode=30`)).body;
  assert.equal(school.zone.name, 'École primaire Les Manguiers (fictive)');
  assert.deepEqual(
    school.zone.path.map((p: { id: string }) => p.id),
    [ID.orgRegion, ID.orgManguiers],
  );
  assert.equal(
    typeof school.kpis.active.previous === 'number' || school.kpis.active.previous === null,
    true,
  );
  await pilot(SUB.bamba, `?zone=${ID.orgBaobabs}`, 404);
  await pilot(SUB.mariam, '?periode=12', 400);

  // Filtre par cycle : un cycle absent ne laisse aucune ligne.
  const lycee = (await pilot(SUB.mariam, '?cycle=lycee')).body;
  assert.equal(lycee.rows.length, 0);
  assert.equal(lycee.coverage.establishments, 0);
});

test('le directeur voit son école ; un enseignant n’a pas accès', async () => {
  const body = (await pilot(SUB.bamba, '')).body;
  assert.equal(body.zone.id, ID.orgManguiers);
  assert.equal(body.rows.length, 0);
  assert.ok(body.coverage.classes >= 2);
  assert.ok(body.funnel.enrolled === null || body.funnel.enrolled >= 5);
  await pilot(SUB.koffi, '', 403);
});
