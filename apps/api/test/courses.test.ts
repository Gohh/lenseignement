import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { auditLogs, courseVersions, lessons } from '../src/db/schema.js';
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
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1/authoring${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

const V1 = ID.courseSyllabesV1;

test('les structures de rédaction suivent les rattachements', async () => {
  const names = async (subject: string) =>
    (await call(subject, 'get', '/organizations', 200)).body.items.map((o: { id: string }) => o.id);
  assert.deepEqual(await names(SUB.koffi), [ID.orgManguiers]);
  assert.deepEqual(
    (await names(SUB.mariam)).sort(),
    [ID.orgRegion, ID.orgManguiers, ID.orgBaobabs].sort(),
  );
  assert.deepEqual(await names(SUB.awa), []);
  assert.deepEqual(await names(SUB.fatou), []);
  assert.deepEqual(await names(SUB.yao), []);
});

test('l’enseignant voit le cours de son école ; l’élève et le parent ne voient rien', async () => {
  const list = await call(SUB.koffi, 'get', '/courses', 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].latest.title, 'Lire ses premières syllabes (démonstration)');
  assert.equal(list.body.items[0].latest.status, 'draft');
  for (const subject of [SUB.awa, SUB.fatou, SUB.yao]) {
    assert.deepEqual((await call(subject, 'get', '/courses', 200)).body.items, []);
  }
});

test('détail d’un brouillon avec programme, compétences, modules et leçons', async () => {
  const res = await call(SUB.koffi, 'get', `/course-versions/${V1}`, 200);
  assert.equal(res.body.number, 1);
  assert.deepEqual(res.body.curriculum, {
    code: 'DEMO-PRIMAIRE',
    label: '2026',
    competencies: [
      { code: 'LECT-01', title: "Reconnaître les lettres de l'alphabet" },
      { code: 'LECT-02', title: 'Lire des syllabes simples' },
    ],
  });
  assert.equal(res.body.modules[0].lessons.length, 2);
});

test('accès refusé (403 uniforme) hors de sa structure, et journalisé', async () => {
  for (const subject of [SUB.awa, SUB.fatou, SUB.yao]) {
    await call(subject, 'get', `/course-versions/${V1}`, 403);
    await call(subject, 'patch', `/course-versions/${V1}`, 403, { revision: 1, title: 'Piraté' });
  }
  const unknown = await call(
    SUB.koffi,
    'get',
    '/course-versions/60000000-0000-4000-8000-0000000000ff',
    403,
  );
  const invalid = await call(SUB.koffi, 'get', '/courses/pas-un-id', 403);
  assert.equal(unknown.body.message, 'Accès refusé.');
  assert.equal(invalid.body.message, 'Accès refusé.');
  // Personne d'une autre école ne peut créer de cours pour Les Manguiers.
  await call(SUB.awa, 'post', '/courses', 403, {
    organizationId: ID.orgManguiers,
    branch: 'primaire',
    title: 'Cours pirate',
  });

  const denied = await ctx.db
    .select()
    .from(auditLogs)
    .where(sql`${auditLogs.resourceId} = ${V1} and ${auditLogs.decision} = 'deny'`);
  assert.ok(denied.length >= 6);
});

test('création d’un cours : brouillon n° 1 dans l’école de l’auteur', async () => {
  const created = await call(SUB.aminata, 'post', '/courses', 201, {
    organizationId: ID.orgManguiers,
    branch: 'primaire',
    title: 'Compter avec les cauris',
    summary: 'Cours fictif.',
  });
  const course = await call(SUB.aminata, 'get', `/courses/${created.body.courseId}`, 200);
  assert.deepEqual(
    course.body.versions.map((v: { number: number; status: string }) => [v.number, v.status]),
    [[1, 'draft']],
  );
  // Validation des données.
  const invalid = await call(SUB.aminata, 'post', '/courses', 400, {
    organizationId: ID.orgManguiers,
    branch: 'inconnue',
    title: 'x',
  });
  assert.match(invalid.body.message, /title|Titre trop court/);
});

test('modification du brouillon : programme exact, compétences, révision', async () => {
  const updated = await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 200, {
    revision: 1,
    title: 'Lire ses premières syllabes',
    curriculum: { code: 'DEMO-PRIMAIRE', label: '2025', competencyCodes: ['LECT-02', 'LECT-03'] },
  });
  assert.equal(updated.body.revision, 2);
  assert.equal(updated.body.title, 'Lire ses premières syllabes');
  assert.deepEqual(
    updated.body.curriculum.competencies.map((c: { code: string }) => c.code),
    ['LECT-02', 'LECT-03'],
  );

  // Compétence absente de la version choisie, ou programme non publié.
  const missing = await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 400, {
    revision: 2,
    curriculum: { code: 'DEMO-PRIMAIRE', label: '2025', competencyCodes: ['CALC-03'] },
  });
  assert.match(missing.body.message, /CALC-03/);
  await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 400, {
    revision: 2,
    curriculum: { code: 'DEMO-PRIMAIRE', label: '2099', competencyCodes: [] },
  });

  // Une révision périmée (modification concurrente) est refusée.
  const stale = await call(SUB.aminata, 'patch', `/course-versions/${V1}`, 409, {
    revision: 1,
    title: 'Écrasement',
  });
  assert.match(stale.body.message, /modifié entre-temps/);
});

test('plan du brouillon remplacé d’un bloc', async () => {
  const res = await call(SUB.koffi, 'put', `/course-versions/${V1}/outline`, 200, {
    revision: 2,
    modules: [
      { title: 'Les voyelles', lessons: [{ title: 'Le a et le i', body: 'a… i…' }] },
      { title: 'Les syllabes', lessons: [{ title: 'ma, mi, mo', estimatedMinutes: 15 }] },
    ],
  });
  assert.equal(res.body.revision, 3);
  assert.deepEqual(
    res.body.modules.map((m: { title: string; lessons: unknown[] }) => [m.title, m.lessons.length]),
    [
      ['Les voyelles', 1],
      ['Les syllabes', 1],
    ],
  );
  assert.equal(res.body.modules[1].lessons[0].estimatedMinutes, 15);
});

test('hors brouillon, la version est figée par la base et par l’API', async () => {
  // Le passage en relecture viendra avec le ticket 9 : on le simule ici directement.
  await ctx.db.update(courseVersions).set({ status: 'in_review' }).where(eq(courseVersions.id, V1));

  await assert.rejects(
    ctx.db.update(lessons).set({ title: 'modifié' }).where(eq(lessons.courseVersionId, V1)),
    (e: { cause?: Error }) => /course_version_immutable/.test(String(e.cause?.message)),
  );
  await assert.rejects(
    ctx.db.update(courseVersions).set({ title: 'modifié' }).where(eq(courseVersions.id, V1)),
    (e: { cause?: Error }) => /course_version_immutable/.test(String(e.cause?.message)),
  );
  const frozen = await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 409, {
    revision: 3,
    title: 'Trop tard',
  });
  assert.match(frozen.body.message, /n’est plus un brouillon/);
});

test('nouvelle version : copie complète, un seul brouillon à la fois', async () => {
  const next = await call(SUB.koffi, 'post', `/courses/${ID.courseSyllabes}/versions`, 201);
  const v2 = await call(SUB.koffi, 'get', `/course-versions/${next.body.versionId}`, 200);
  assert.equal(v2.body.number, 2);
  assert.equal(v2.body.status, 'draft');
  assert.equal(v2.body.title, 'Lire ses premières syllabes');
  assert.equal(v2.body.modules.length, 2);
  assert.deepEqual(
    v2.body.curriculum.competencies.map((c: { code: string }) => c.code),
    ['LECT-02', 'LECT-03'],
  );

  await call(SUB.koffi, 'post', `/courses/${ID.courseSyllabes}/versions`, 409);

  // Le brouillon n° 2 se supprime ; la version n° 1 (figée) reste.
  await call(SUB.koffi, 'delete', `/course-versions/${next.body.versionId}`, 204);
  await call(SUB.koffi, 'delete', `/course-versions/${V1}`, 409);
  const course = await call(SUB.koffi, 'get', `/courses/${ID.courseSyllabes}`, 200);
  assert.deepEqual(
    course.body.versions.map((v: { number: number }) => v.number),
    [1],
  );
});
