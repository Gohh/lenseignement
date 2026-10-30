import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
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

test('ADR-020 : le parent ajoute un enfant et confie son suivi à un répétiteur, en lecture seule', async () => {
  // Le parent ajoute son enfant : lui seul peut ouvrir sa fiche.
  await call(SUB.fatou, 'post', '/family/children', 400, { displayName: 'A' });
  const child = (
    await call(SUB.fatou, 'post', '/family/children', 201, {
      displayName: 'Awa (fictive)',
      level: 'cp2',
    })
  ).body;
  const list = (await call(SUB.fatou, 'get', '/family/children', 200)).body.items;
  const mine = list.find((c: { id: string }) => c.id === child.id);
  assert.equal(mine.displayName, 'Awa (fictive)');
  assert.equal(mine.level, 'cp2');
  await call(SUB.fatou, 'get', `/learners/${child.id}`, 200);
  await call(SUB.yao, 'get', `/learners/${child.id}`, 403);

  // On ne confie pas l'enfant d'un autre, ni avec un mauvais code.
  await call(SUB.yao, 'post', '/family/invitations', 400, { learnerIds: [child.id] });
  await call(SUB.yao, 'post', '/family/invitations/redeem', 404, { code: 'AAAAAAAA' });

  // Invitation : un code, utilisable une seule fois, pas par le parent lui-même.
  const { code } = (
    await call(SUB.fatou, 'post', '/family/invitations', 201, { learnerIds: [child.id] })
  ).body;
  assert.match(code, /^[A-Z2-9]{8}$/);
  await call(SUB.fatou, 'post', '/family/invitations/redeem', 404, { code });
  const redeemed = await call(SUB.yao, 'post', '/family/invitations/redeem', 201, {
    code: code.toLowerCase().replace(/^(.{4})/, '$1 '),
  });
  assert.equal(redeemed.body.children, 1);
  await call(SUB.yao, 'post', '/family/invitations/redeem', 404, { code });

  // Le répétiteur lit la fiche, mais ne décide pas.
  await call(SUB.yao, 'get', `/learners/${child.id}`, 200);
  const tutored = (await call(SUB.yao, 'get', '/family/tutored', 200)).body.items;
  assert.deepEqual(
    tutored.map((c: { id: string }) => c.id),
    [child.id],
  );
  await call(SUB.yao, 'post', `/learners/${child.id}/remediation/LECTURE/override`, 403, {});

  // Le parent voit le répétiteur et peut retirer l'accès.
  const after = (await call(SUB.fatou, 'get', '/family/children', 200)).body.items.find(
    (c: { id: string }) => c.id === child.id,
  );
  assert.equal(after.tutors.length, 1);
  await call(SUB.yao, 'delete', `/family/tutors/${after.tutors[0].linkId}`, 404);
  await call(SUB.fatou, 'delete', `/family/tutors/${after.tutors[0].linkId}`, 200);
  await call(SUB.yao, 'get', `/learners/${child.id}`, 403);
  assert.deepEqual((await call(SUB.yao, 'get', '/family/tutored', 200)).body.items, []);
});

test('code parent : le parent se relie à l’élève inscrit par l’école, deux parents au plus', async () => {
  const aya = ID.learnerAya;
  const path = `/cohorts/${ID.cohortCp1A}/learners/${aya}/parent-code`;
  const [mother, father, third] = [randomUUID(), randomUUID(), randomUUID()];
  try {
    // Seule la direction de l'établissement donne un code ; un parent ou un enseignant, non.
    await call(SUB.fatou, 'post', path, 404);
    const first = (await call(SUB.bamba, 'post', path, 201)).body.code;
    assert.match(first, /^[A-Z2-9]{8}$/);
    const tools = (await call(SUB.bamba, 'get', `/cohorts/${ID.cohortCp1A}/roster-tools`, 200))
      .body;
    const row = tools.parents.find((p: { learnerId: string }) => p.learnerId === aya);
    assert.deepEqual(row, { learnerId: aya, code: first, linked: 0 });

    // Mauvais code : message unique. Bon code (minuscules, espace) : le vrai élève est relié.
    await call(mother, 'post', '/family/children/link', 404, { code: 'AAAAAAAA' });
    const linked = await call(mother, 'post', '/family/children/link', 201, {
      code: first.toLowerCase().replace(/^(.{4})/, '$1 '),
    });
    assert.equal(linked.body.id, aya);
    await call(mother, 'post', '/family/children/link', 400, { code: first });
    const children = (await call(mother, 'get', '/family/children', 200)).body.items;
    assert.deepEqual(
      children.map((c: { id: string }) => c.id),
      [aya],
    );
    assert.equal(children[0].classes[0].name, 'CP1 A');
    await call(mother, 'get', `/learners/${aya}`, 200);
    // Le parent peut maintenant écrire à l'enseignant de la classe.
    const contacts = (await call(mother, 'get', '/me/message-contacts', 200)).body;
    assert.ok(JSON.stringify(contacts).includes(ID.userKoffi));

    // Le second parent passe, le troisième non ; un nouveau code remplace l'ancien.
    await call(father, 'post', '/family/children/link', 201, { code: first });
    await call(third, 'post', '/family/children/link', 400, { code: first });
    const second = (await call(SUB.bamba, 'post', path, 201)).body.code;
    assert.notEqual(second, first);
    await call(third, 'post', '/family/children/link', 404, { code: first });

    // Le parent confie l'élève réel à un répétiteur.
    const { code } = (await call(mother, 'post', '/family/invitations', 201, { learnerIds: [aya] }))
      .body;
    await call(third, 'post', '/family/invitations/redeem', 201, { code });
    await call(third, 'get', `/learners/${aya}`, 200);
  } finally {
    await ctx.db.execute(sql`delete from tutor_links where learner_user_id = ${aya}`);
    await ctx.db.execute(sql`delete from tutor_invitations where ${aya} = any(learner_user_ids)`);
    await ctx.db.execute(sql`delete from guardian_links where learner_user_id = ${aya}`);
    await ctx.db.execute(sql`delete from parent_codes where learner_user_id = ${aya}`);
  }
});
