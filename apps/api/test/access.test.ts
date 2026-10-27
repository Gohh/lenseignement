import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { auditLogs, guardianLinks, memberships } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

/** Appelle l'API au nom d'un compte de démonstration et vérifie le statut HTTP. */
async function get(subject: string, path: string, status: number, traceId?: string) {
  const token = await ctx.sign({ sub: subject });
  const req = request(ctx.app.getHttpServer())
    .get(`/api/v1${path}`)
    .set('authorization', `Bearer ${token}`);
  return (traceId ? req.set('x-request-id', traceId) : req).expect(status);
}

const cohortCodes = (body: Array<{ code: string; organization: { id: string } }>) =>
  body.map((c) => `${c.organization.id === ID.orgBaobabs ? 'baobabs' : 'manguiers'}:${c.code}`);

test('GET /me renvoie le compte et les rattachements de la personne', async () => {
  const res = await get(SUB.koffi, '/me', 200);
  assert.equal(res.body.userId, ID.userKoffi);
  assert.deepEqual(res.body.memberships, [
    {
      organizationId: ID.orgManguiers,
      organizationName: 'École primaire Les Manguiers (fictive)',
      role: 'enseignant',
    },
  ]);
});

test('un enseignant ne voit que les classes où il enseigne', async () => {
  const res = await get(SUB.koffi, '/cohorts', 200);
  assert.deepEqual(cohortCodes(res.body), ['manguiers:CP1-A']);
  assert.equal(res.body[0].learnerCount, 3);
});

test('le directeur voit toutes les classes de son école, pas celles des autres', async () => {
  const res = await get(SUB.bamba, '/cohorts', 200);
  assert.deepEqual(cohortCodes(res.body), ['manguiers:CP1-A', 'manguiers:CP1-B']);
});

test('le référent régional voit les classes des écoles rattachées à sa région', async () => {
  const res = await get(SUB.mariam, '/cohorts', 200);
  assert.deepEqual(cohortCodes(res.body).sort(), [
    'baobabs:CE1-A',
    'manguiers:CP1-A',
    'manguiers:CP1-B',
  ]);
});

test('un élève, un parent ou un administrateur technique ne voit aucune classe', async () => {
  for (const subject of [SUB.awa, SUB.fatou, SUB.yao]) {
    const res = await get(subject, '/cohorts', 200);
    assert.deepEqual(res.body, []);
  }
});

test("l'enseignant lit sa classe et la liste de ses élèves", async () => {
  const res = await get(SUB.koffi, `/cohorts/${ID.cohortCp1A}`, 200);
  assert.equal(res.body.code, 'CP1-A');
  assert.deepEqual(
    res.body.learners.map((l: { id: string }) => l.id).sort(),
    [ID.userAwa, ID.learnerKouame, ID.learnerAya].sort(),
  );
});

test("un enseignant ne lit pas la classe d'un collègue (IDOR) : 403 uniforme", async () => {
  const res = await get(SUB.koffi, `/cohorts/${ID.cohortCp1B}`, 403);
  assert.deepEqual(Object.keys(res.body).sort(), ['code', 'message', 'trace_id']);
  assert.equal(res.body.message, 'Accès refusé.');
});

test('une classe inexistante ou un identifiant invalide donnent la même réponse qu’un refus', async () => {
  const missing = await get(SUB.koffi, '/cohorts/30000000-0000-4000-8000-0000000000ff', 403);
  const invalid = await get(SUB.koffi, "/cohorts/1'%20or%201=1", 403);
  const forbidden = await get(SUB.koffi, `/cohorts/${ID.cohortCp1B}`, 403);
  for (const res of [missing, invalid]) {
    assert.equal(res.body.code, forbidden.body.code);
    assert.equal(res.body.message, forbidden.body.message);
  }
});

const learnerCases: Array<[string, string, string, number]> = [
  ['Awa lit sa propre fiche', SUB.awa, ID.userAwa, 200],
  ['Awa ne lit pas la fiche d’un camarade', SUB.awa, ID.learnerKouame, 403],
  ['Fatou lit la fiche de sa fille (lien vérifié)', SUB.fatou, ID.userAwa, 200],
  ['Fatou ne lit pas Seydou (lien en attente)', SUB.fatou, ID.learnerSeydou, 403],
  ['Koffi lit un élève de sa classe', SUB.koffi, ID.learnerKouame, 200],
  ['Koffi ne lit pas un élève de CP1-B', SUB.koffi, ID.learnerSeydou, 403],
  ['Bamba lit un élève de son école', SUB.bamba, ID.learnerSeydou, 200],
  ['Bamba ne lit pas un élève d’une autre école', SUB.bamba, ID.learnerMoussa, 403],
  ['Mariam lit un élève de sa région', SUB.mariam, ID.learnerMoussa, 200],
  ['l’administrateur technique n’a pas accès aux élèves', SUB.yao, ID.userAwa, 403],
];

for (const [label, subject, learnerId, status] of learnerCases) {
  test(`fiche élève : ${label}`, async () => {
    await get(subject, `/learners/${learnerId}`, status);
  });
}

test('la fiche élève indique sa classe', async () => {
  const res = await get(SUB.fatou, `/learners/${ID.userAwa}`, 200);
  assert.equal(res.body.displayName, 'Awa (fictive)');
  assert.deepEqual(
    res.body.cohorts.map((c: { code: string }) => c.code),
    ['CP1-A'],
  );
});

test('GET /me/children ne liste que les liens vérifiés', async () => {
  const res = await get(SUB.fatou, '/me/children', 200);
  assert.deepEqual(res.body, [{ id: ID.userAwa, displayName: 'Awa (fictive)' }]);
});

test('un lien parent révoqué ferme l’accès immédiatement', async () => {
  const pair = and(
    eq(guardianLinks.guardianUserId, ID.userFatou),
    eq(guardianLinks.learnerUserId, ID.userAwa),
  );
  await ctx.db
    .update(guardianLinks)
    .set({ status: 'revoked', revokedAt: sql`now()` })
    .where(pair);
  try {
    await get(SUB.fatou, `/learners/${ID.userAwa}`, 403);
    assert.deepEqual((await get(SUB.fatou, '/me/children', 200)).body, []);
  } finally {
    await ctx.db.update(guardianLinks).set({ status: 'verified', revokedAt: null }).where(pair);
  }
});

test('un rattachement enseignant expiré retire l’accès à la classe', async () => {
  const koffi = and(eq(memberships.userId, ID.userKoffi), eq(memberships.role, 'enseignant'));
  await ctx.db
    .update(memberships)
    .set({ validUntil: sql`now() - interval '1 day'` })
    .where(koffi);
  try {
    await get(SUB.koffi, `/cohorts/${ID.cohortCp1A}`, 403);
    assert.deepEqual((await get(SUB.koffi, '/cohorts', 200)).body, []);
  } finally {
    await ctx.db.update(memberships).set({ validUntil: null }).where(koffi);
  }
});

test('chaque décision est journalisée avec le trace_id, sans donnée personnelle', async () => {
  await get(SUB.koffi, `/cohorts/${ID.cohortCp1A}`, 200, 'trace-allow-0001');
  const denied = await get(SUB.koffi, `/learners/${ID.learnerMoussa}`, 403, 'trace-deny-0001');
  assert.equal(denied.body.trace_id, 'trace-deny-0001');

  const rows = await ctx.db
    .select()
    .from(auditLogs)
    .where(sql`${auditLogs.traceId} in ('trace-allow-0001', 'trace-deny-0001')`)
    .orderBy(auditLogs.traceId);
  assert.deepEqual(
    rows.map((r) => [r.traceId, r.actorUserId, r.action, r.resourceId, r.decision, r.reason]),
    [
      ['trace-allow-0001', ID.userKoffi, 'cohort.read', ID.cohortCp1A, 'allow', 'scope'],
      ['trace-deny-0001', ID.userKoffi, 'learner.read', ID.learnerMoussa, 'deny', 'out_of_scope'],
    ],
  );
});

test('un compte suspendu est refusé partout', async () => {
  await ctx.db.execute(sql`update users set status = 'suspended' where id = ${ID.userKoffi}`);
  try {
    await get(SUB.koffi, '/me', 403);
    await get(SUB.koffi, '/cohorts', 403);
  } finally {
    await ctx.db.execute(sql`update users set status = 'active' where id = ${ID.userKoffi}`);
  }
});
