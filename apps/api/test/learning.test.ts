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

// Apprenants inconnus du jeu de démonstration : chacun part d'une progression vide.
const ALI = 'apprenant-test-ali';
const ESI = 'apprenant-test-esi';

async function call(
  subject: string,
  method: 'get' | 'post',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

const NOMBRES = ID.courseNombres; // publié, 2 leçons
const MOTS = ID.courseMots; // publié, 1 leçon

test('connexion obligatoire', async () => {
  const server = ctx.app.getHttpServer();
  await request(server).post('/api/v1/enrollments').send({ courseId: NOMBRES }).expect(401);
  await request(server).get('/api/v1/me/learning-plan').expect(401);
  await request(server).get(`/api/v1/me/courses/${NOMBRES}/progress`).expect(401);
  await request(server)
    .post('/api/v1/me/progress/completed')
    .send({ courseId: NOMBRES, lessonNumber: 1 })
    .expect(401);
});

test('avant inscription : progression vide, et une leçon ne peut pas être marquée', async () => {
  const res = await call(ALI, 'get', `/me/courses/${NOMBRES}/progress`, 200);
  assert.deepEqual(res.body, {
    courseId: NOMBRES,
    enrolled: false,
    total: 2,
    completed: [],
    resumeAt: null,
    finished: false,
  });
  const refused = await call(ALI, 'post', '/me/progress/completed', 409, {
    courseId: NOMBRES,
    lessonNumber: 1,
  });
  assert.equal(refused.body.message, 'Inscrivez-vous d’abord à ce cours.');
  await call(ALI, 'post', '/me/progress/opened', 409, { courseId: NOMBRES, lessonNumber: 1 });
});

test('seuls les cours publiés se suivent', async () => {
  // Brouillon et cours en relecture : comme s'ils n'existaient pas.
  await call(ALI, 'post', '/enrollments', 404, { courseId: ID.courseSyllabes });
  await call(ALI, 'post', '/enrollments', 404, { courseId: ID.courseMarche });
  await call(ALI, 'get', `/me/courses/${ID.courseSyllabes}/progress`, 404);
  await call(ALI, 'get', '/me/courses/pas-un-id/progress', 404);
  await call(ALI, 'post', '/enrollments', 400, { courseId: 'pas-un-id' });
});

test('inscription idempotente, puis reprise à la première leçon', async () => {
  const first = await call(ALI, 'post', '/enrollments', 201, { courseId: NOMBRES });
  assert.equal(first.body.enrolled, true);
  assert.equal(first.body.resumeAt, 1);
  const again = await call(ALI, 'post', '/enrollments', 201, { courseId: NOMBRES });
  assert.deepEqual(again.body, first.body);
  const [{ n }] = (
    await ctx.db.$client.query<{ n: number }>(
      'select count(*)::int as n from enrollments where course_id = $1',
      [NOMBRES],
    )
  ).rows as [{ n: number }];
  assert.equal(n, 1);
});

test('leçon terminée : sans doublon, et la reprise avance', async () => {
  await call(ALI, 'post', '/me/progress/opened', 204, { courseId: NOMBRES, lessonNumber: 1 });
  const done = await call(ALI, 'post', '/me/progress/completed', 201, {
    courseId: NOMBRES,
    lessonNumber: 1,
  });
  assert.deepEqual(done.body.completed, [1]);
  assert.equal(done.body.resumeAt, 2);
  assert.equal(done.body.finished, false);

  // Double envoi (double clic, réseau lent) : rien ne change.
  const twice = await call(ALI, 'post', '/me/progress/completed', 201, {
    courseId: NOMBRES,
    lessonNumber: 1,
  });
  assert.deepEqual(twice.body, done.body);

  // Relire la leçon 1 ne fait pas reculer la reprise : elle est déjà terminée.
  await call(ALI, 'post', '/me/progress/opened', 204, { courseId: NOMBRES, lessonNumber: 1 });
  const progress = await call(ALI, 'get', `/me/courses/${NOMBRES}/progress`, 200);
  assert.equal(progress.body.resumeAt, 2);
  assert.deepEqual(progress.body.completed, [1]);

  await call(ALI, 'post', '/me/progress/completed', 404, { courseId: NOMBRES, lessonNumber: 3 });
  await call(ALI, 'post', '/me/progress/completed', 400, { courseId: NOMBRES, lessonNumber: 0 });
  await call(ALI, 'post', '/me/progress/completed', 400, { courseId: NOMBRES, lessonNumber: 1.5 });
});

test('cours terminé', async () => {
  const done = await call(ALI, 'post', '/me/progress/completed', 201, {
    courseId: NOMBRES,
    lessonNumber: 2,
  });
  assert.deepEqual(done.body.completed, [1, 2]);
  assert.equal(done.body.finished, true);
  assert.equal(done.body.resumeAt, null);
});

test('mes cours suivis : le plus récent d’abord', async () => {
  await call(ALI, 'post', '/enrollments', 201, { courseId: MOTS });
  const res = await call(ALI, 'get', '/me/learning-plan', 200);
  assert.deepEqual(
    res.body.items.map((i: { courseId: string; finished: boolean }) => [i.courseId, i.finished]),
    [
      [MOTS, false],
      [NOMBRES, true],
    ],
  );
  assert.equal(res.body.items[0].title, 'Lire des mots courts (démonstration)');
  assert.equal(res.body.items[0].branch, 'primaire');
  assert.equal(res.body.items[0].resumeAt, 1);
});

test('chacun ne voit que sa propre progression', async () => {
  assert.deepEqual((await call(ESI, 'get', '/me/learning-plan', 200)).body.items, []);
  const progress = await call(ESI, 'get', `/me/courses/${NOMBRES}/progress`, 200);
  assert.equal(progress.body.enrolled, false);
  assert.deepEqual(progress.body.completed, []);
  // Un identifiant de personne glissé dans la requête est ignoré : seule compte l'identité du jeton.
  await call(ESI, 'post', '/me/progress/completed', 409, {
    courseId: NOMBRES,
    lessonNumber: 1,
    userId: ALI,
  });
  const ali = await call(ALI, 'get', `/me/courses/${NOMBRES}/progress`, 200);
  assert.deepEqual(ali.body.completed, [1, 2]);
});
