import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { quizAttempts, quizQuestions } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

// Apprenants inconnus du jeu de démonstration : chacun part de zéro.
const ALI = 'apprenant-quiz-ali';
const ESI = 'apprenant-quiz-esi';
const COURSE = ID.courseAdditions; // publié, 2 leçons avec quiz (2 questions puis 1)

async function call(
  subject: string | null,
  method: 'get' | 'post' | 'put',
  path: string,
  status: number,
  body?: object,
) {
  const server = request(ctx.app.getHttpServer());
  let req = server[method](`/api/v1${path}`);
  if (subject) req = req.set('Authorization', `Bearer ${await ctx.sign({ sub: subject })}`);
  return (body ? req.send(body) : req).expect(status);
}

interface PublicQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

async function lessonQuiz(number: number): Promise<PublicQuestion[]> {
  return (await call(null, 'get', `/catalog/courses/${COURSE}/lessons/${number}`, 200)).body.quiz;
}

test('la leçon publique montre le quiz, sans les bonnes réponses', async () => {
  const quiz = await lessonQuiz(1);
  assert.deepEqual(
    quiz.map((q) => [q.prompt, q.choices]),
    [
      [
        'Deux mangues et encore une mangue : combien de mangues en tout ?',
        ['Deux', 'Trois', 'Quatre'],
      ],
      [
        'Quatre cailloux et encore un caillou : combien de cailloux en tout ?',
        ['Cinq', 'Six', 'Trois'],
      ],
    ],
  );
  const text = JSON.stringify(quiz);
  assert.ok(!text.includes('correct'), 'aucune bonne réponse avant de répondre');
  assert.ok(!text.includes('explanation'));
  // Une leçon sans quiz renvoie une liste vide.
  const plain = await call(null, 'get', `/catalog/courses/${ID.courseNombres}/lessons/1`, 200);
  assert.deepEqual(plain.body.quiz, []);
});

test('correction sans connexion : score, bonnes réponses et explications', async () => {
  const [q1, q2] = await lessonQuiz(1);
  const res = await call(null, 'post', '/quiz/check', 200, {
    courseId: COURSE,
    lessonNumber: 1,
    answers: [
      { questionId: q1!.id, choice: 1 },
      { questionId: q2!.id, choice: 1 },
    ],
  });
  assert.equal(res.body.score, 1);
  assert.equal(res.body.total, 2);
  assert.deepEqual(
    res.body.items.map((i: { correct: boolean; correctChoice: number }) => [
      i.correct,
      i.correctChoice,
    ]),
    [
      [true, 1],
      [false, 0],
    ],
  );
  assert.match(res.body.items[1].explanation, /quatre et un font cinq/);
  assert.equal(res.body.attemptId, undefined);
  // Rien n'est enregistré pour un visiteur.
  const [{ n }] = (await ctx.db.$client.query('select count(*)::int as n from quiz_attempts'))
    .rows as [{ n: number }];
  assert.equal(n, 0);
});

test('réponses incomplètes, en double ou hors sujet refusées', async () => {
  const [q1, q2] = await lessonQuiz(1);
  const [other] = await lessonQuiz(2);
  const check = (answers: object[], status = 400) =>
    call(null, 'post', '/quiz/check', status, { courseId: COURSE, lessonNumber: 1, answers });
  const missing = await check([{ questionId: q1!.id, choice: 1 }]);
  assert.equal(missing.body.message, 'Répondez à chaque question, une seule fois.');
  await check([
    { questionId: q1!.id, choice: 1 },
    { questionId: q1!.id, choice: 0 },
  ]);
  await check([
    { questionId: q1!.id, choice: 1 },
    { questionId: other!.id, choice: 1 },
  ]);
  // Choix inexistant (la question a trois choix).
  await check([
    { questionId: q1!.id, choice: 3 },
    { questionId: q2!.id, choice: 0 },
  ]);
  await check([], 400);
  // Leçon sans quiz, leçon inconnue, cours non publié.
  const answers = [{ questionId: q1!.id, choice: 1 }];
  await call(null, 'post', '/quiz/check', 404, {
    courseId: ID.courseNombres,
    lessonNumber: 1,
    answers,
  });
  await call(null, 'post', '/quiz/check', 404, { courseId: COURSE, lessonNumber: 9, answers });
  await call(null, 'post', '/quiz/check', 404, {
    courseId: ID.courseSyllabes,
    lessonNumber: 1,
    answers,
  });
});

test('tentative enregistrée : connexion et inscription obligatoires', async () => {
  const [q] = await lessonQuiz(2);
  const body = {
    attemptId: randomUUID(),
    courseId: COURSE,
    lessonNumber: 2,
    answers: [{ questionId: q!.id, choice: 1 }],
  };
  await call(null, 'post', '/me/quiz-attempts', 401, body);
  const refused = await call(ALI, 'post', '/me/quiz-attempts', 409, body);
  assert.equal(refused.body.message, 'Inscrivez-vous d’abord à ce cours.');
  await call(ALI, 'get', `/me/quiz-attempts/latest?courseId=${COURSE}&lessonNumber=2`, 200).then(
    (res) => assert.equal(res.body.attempt, null),
  );
});

test('tentative enregistrée une seule fois, même renvoyée', async () => {
  await call(ALI, 'post', '/enrollments', 201, { courseId: COURSE });
  const [q] = await lessonQuiz(2);
  const body = {
    attemptId: randomUUID(),
    courseId: COURSE,
    lessonNumber: 2,
    answers: [{ questionId: q!.id, choice: 0 }],
  };
  const first = await call(ALI, 'post', '/me/quiz-attempts', 201, body);
  assert.equal(first.body.score, 0);
  assert.equal(first.body.attemptId, body.attemptId);

  // Renvoi (double clic, réseau rétabli) : même correction, aucune seconde tentative.
  const again = await call(ALI, 'post', '/me/quiz-attempts', 201, body);
  assert.deepEqual(again.body, first.body);
  // Même renvoyée avec d'autres réponses, la tentative reste celle reçue la première fois.
  const changed = await call(ALI, 'post', '/me/quiz-attempts', 201, {
    ...body,
    answers: [{ questionId: q!.id, choice: 1 }],
  });
  assert.equal(changed.body.score, 0);
  const rows = await ctx.db.select().from(quizAttempts).where(eq(quizAttempts.id, body.attemptId));
  assert.equal(rows.length, 1);

  // Nouvelle tentative, réussie : c'est elle, la dernière.
  await call(ALI, 'post', '/me/quiz-attempts', 201, {
    ...body,
    attemptId: randomUUID(),
    answers: [{ questionId: q!.id, choice: 1 }],
  });
  const latest = await call(
    ALI,
    'get',
    `/me/quiz-attempts/latest?courseId=${COURSE}&lessonNumber=2`,
    200,
  );
  assert.equal(latest.body.attempt.score, 1);
  assert.equal(latest.body.attempt.total, 1);
  await call(ALI, 'get', '/me/quiz-attempts/latest?courseId=pas-un-id&lessonNumber=2', 400);
});

test('chacun ne voit et ne rejoue que ses propres tentatives', async () => {
  await call(ESI, 'post', '/enrollments', 201, { courseId: COURSE });
  const latest = await call(
    ESI,
    'get',
    `/me/quiz-attempts/latest?courseId=${COURSE}&lessonNumber=2`,
    200,
  );
  assert.equal(latest.body.attempt, null);
  // Rejouer l'identifiant de tentative d'une autre personne ne révèle rien.
  const [aliAttempt] = await ctx.db.select().from(quizAttempts).limit(1);
  const [q] = await lessonQuiz(2);
  const res = await call(ESI, 'post', '/me/quiz-attempts', 409, {
    attemptId: aliAttempt!.id,
    courseId: COURSE,
    lessonNumber: 2,
    answers: [{ questionId: q!.id, choice: 1 }],
  });
  assert.equal(res.body.message, 'Tentative déjà enregistrée.');
});

test('les tentatives ne se modifient ni ne se suppriment', async () => {
  await assert.rejects(
    ctx.db.update(quizAttempts).set({ score: 1 }),
    (error: { cause?: { message?: string } }) =>
      /ajout seulement/.test(error.cause?.message ?? String(error)),
  );
  await assert.rejects(ctx.db.delete(quizAttempts));
});

test('rédaction : le quiz suit le plan, il est vérifié et figé à la publication', async () => {
  const authoring = (method: 'get' | 'post' | 'put', path: string, status: number, body?: object) =>
    call(SUB.koffi, method, `/authoring${path}`, status, body);

  // Nouvelle version du cours publié : le quiz est recopié dans le brouillon.
  const created = await authoring('post', `/courses/${COURSE}/versions`, 201);
  const draftId = created.body.versionId as string;
  const draft = await authoring('get', `/course-versions/${draftId}`, 200);
  assert.deepEqual(draft.body.modules[0].lessons[0].quiz[0], {
    prompt: 'Deux mangues et encore une mangue : combien de mangues en tout ?',
    choices: ['Deux', 'Trois', 'Quatre'],
    correct: 1,
    explanation: 'On compte deux, puis on ajoute un : trois mangues.',
  });

  const outline = (quiz: object[]) => ({
    revision: draft.body.revision,
    modules: [
      {
        title: 'Premières additions',
        lessons: [{ title: 'Ajouter un objet', body: 'Deux et un : trois.', quiz }],
      },
    ],
  });
  const bad = await authoring(
    'put',
    `/course-versions/${draftId}/outline`,
    400,
    outline([{ prompt: 'Combien ?', choices: ['Un', 'Deux'], correct: 2 }]),
  );
  assert.match(bad.body.message, /La bonne réponse doit être l’un des choix/);
  await authoring(
    'put',
    `/course-versions/${draftId}/outline`,
    400,
    outline([{ prompt: 'Combien ?', choices: ['Un'], correct: 0 }]),
  );
  const saved = await authoring(
    'put',
    `/course-versions/${draftId}/outline`,
    200,
    outline([{ prompt: 'Un et un ?', choices: ['Deux', 'Trois'], correct: 0 }]),
  );
  assert.deepEqual(saved.body.modules[0].lessons[0].quiz, [
    { prompt: 'Un et un ?', choices: ['Deux', 'Trois'], correct: 0, explanation: '' },
  ]);

  // Les questions d'une version publiée sont figées par la base.
  await assert.rejects(
    ctx.db
      .update(quizQuestions)
      .set({ correctChoice: 0 })
      .where(eq(quizQuestions.courseVersionId, ID.courseAdditionsV1)),
  );
  const [{ n }] = (
    await ctx.db.execute<{ n: number }>(
      sql`select count(*)::int as n from quiz_questions where course_version_id = ${ID.courseAdditionsV1}`,
    )
  ).rows as [{ n: number }];
  assert.equal(n, 3);
});
