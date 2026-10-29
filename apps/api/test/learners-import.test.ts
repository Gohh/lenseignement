import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { cohortMembers, users } from '../src/db/schema.js';
import { IdentityError, type IdentityAdmin, type NewIdentity } from '../src/team/identity-admin.js';
import { createTestApp, type TestContext } from './helpers.js';

const taken = new Set(['awa.kone']);
const asked: NewIdentity[] = [];
const fake: IdentityAdmin = {
  configured: () => true,
  async createUser(input) {
    asked.push(input);
    if (input.lastName === 'Panne') throw new IdentityError('failed', 'Keycloak ne répond pas.');
    if (taken.has(input.username))
      throw new IdentityError('exists', 'Cet identifiant est déjà pris.');
    taken.add(input.username);
    return { id: randomUUID() };
  },
};

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp({ identityAdmin: fake });
});

after(async () => {
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('la direction inscrit des élèves sans e-mail : identifiant, mot de passe provisoire, classe', async () => {
  const { id } = (
    await call(SUB.bamba, 'post', '/cohorts', 201, {
      organizationId: ID.orgManguiers,
      level: 'cp2',
      name: `CP2 import ${Date.now() % 100000}`,
      schoolYear: '2026-2027',
    })
  ).body;
  const tools = (await call(SUB.bamba, 'get', `/cohorts/${id}/roster-tools`, 200)).body;
  assert.equal(tools.canCreateAccounts, true);

  const learners = [
    { firstName: 'Awa', lastName: 'Koné' },
    { firstName: 'Moussa', lastName: 'Traoré' },
    { firstName: 'Zié', lastName: 'Panne' },
  ];
  // Ni un enseignant, ni un élève ; et pas de liste vide.
  await call(SUB.koffi, 'post', `/cohorts/${id}/learners`, 404, { learners });
  await call(SUB.awa, 'post', `/cohorts/${id}/learners`, 404, { learners });
  await call(SUB.bamba, 'post', `/cohorts/${id}/learners`, 400, { learners: [] });

  const res = (await call(SUB.bamba, 'post', `/cohorts/${id}/learners`, 201, { learners })).body;
  assert.equal(res.created.length, 2);
  // « awa.kone » est déjà pris : un numéro est ajouté.
  assert.match(res.created[0].username, /^awa\.kone\d{2}$/);
  assert.equal(res.created[1].username, 'moussa.traore');
  assert.match(res.created[1].temporaryPassword, /^[A-Z][a-z]{3}-\d{4}-/);
  assert.deepEqual(res.failed, [{ displayName: 'Zié Panne', reason: 'Keycloak ne répond pas.' }]);
  assert.ok(asked.every((a) => a.email === undefined));

  // Les élèves sont dans la classe, avec le niveau de la classe.
  const members = await ctx.db
    .select({ level: users.level, profiles: users.profiles, name: users.displayName })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(eq(cohortMembers.cohortId, id));
  assert.deepEqual(members.map((m) => m.name).sort(), ['Awa Koné', 'Moussa Traoré']);
  assert.ok(members.every((m) => m.level === 'cp2' && m.profiles.includes('apprenant')));
});
