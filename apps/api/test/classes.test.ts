import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('la direction crée une classe, y affecte un enseignant, et un élève la rejoint avec le code', async () => {
  const base = {
    organizationId: ID.orgManguiers,
    level: 'ce2',
    name: 'CE2 Z (test)',
    schoolYear: '2026-2027',
  };
  // Seule la direction (ou un administrateur) crée une classe, et seulement un niveau du bon type.
  await call(SUB.aminata, 'post', '/cohorts', 403, base);
  await call(SUB.bamba, 'post', '/cohorts', 400, { ...base, level: '6e' });
  await call(SUB.bamba, 'post', '/cohorts', 400, { ...base, schoolYear: '2026' });
  const { id } = (await call(SUB.bamba, 'post', '/cohorts', 201, base)).body;
  await call(SUB.bamba, 'post', '/cohorts', 400, base);

  const view = (await call(SUB.bamba, 'get', `/organizations/${ID.orgManguiers}/cohorts`, 200))
    .body;
  const created = view.items.find((c: { id: string }) => c.id === id);
  assert.equal(created.levelLabel, 'Primaire CE2');
  assert.match(created.joinCode, /^[A-Z2-9]{6}$/);
  assert.ok(view.levels.some((l: { code: string }) => l.code === 'cm2'));
  assert.ok(!view.levels.some((l: { code: string }) => l.code === '6e'));
  await call(SUB.fatou, 'get', `/organizations/${ID.orgManguiers}/cohorts`, 404);

  // Un enseignant de l'équipe s'affecte ; un élève ou un étranger à l'équipe, non.
  await call(SUB.bamba, 'post', `/cohorts/${id}/teachers`, 400, { userId: ID.userAwa });
  await call(SUB.bamba, 'post', `/cohorts/${id}/teachers`, 200, { userId: ID.userKoffi });

  // L'élève saisit le code : classe, établissement, profil et niveau suivent.
  await call('eleve-code-classe', 'post', '/me/join-cohort', 404, { code: 'ZZZZZZ' });
  await call('eleve-code-classe', 'post', '/me/join-cohort', 200, { code: created.joinCode });
  const me = (await call('eleve-code-classe', 'get', '/me', 200)).body;
  assert.ok(me.memberships.some((m: { role: string }) => m.role === 'apprenant'));
  assert.ok(me.profiles.includes('apprenant'));
  assert.equal(me.level, 'ce2');

  // Sa question arrive à l'enseignant de sa classe.
  const asked = (
    await call('eleve-code-classe', 'post', '/me/help-questions', 201, {
      kind: 'stuck',
      body: 'Je viens de rejoindre la classe.',
    })
  ).body;
  const inbox = (await call(SUB.koffi, 'get', '/help/inbox', 200)).body.items;
  assert.ok(inbox.some((q: { id: string }) => q.id === asked.id));

  // Nouveau code : l'ancien ne marche plus. Archivée, la classe n'accepte plus personne.
  const renewed = (await call(SUB.bamba, 'post', `/cohorts/${id}/code`, 200)).body.joinCode;
  assert.notEqual(renewed, created.joinCode);
  await call('autre-eleve', 'post', '/me/join-cohort', 404, { code: created.joinCode });
  await call(SUB.bamba, 'post', `/cohorts/${id}/archive`, 200);
  await call('autre-eleve', 'post', '/me/join-cohort', 404, { code: renewed });
  await call(SUB.bamba, 'post', `/cohorts/${id}/restore`, 200);
  await call(SUB.bamba, 'delete', `/cohorts/${id}/teachers/${ID.userKoffi}`, 200);
});
