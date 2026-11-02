import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql } from './support/db';

// Devoir fait d'exercices de la Fabrique : l'enseignant les choisit dans la banque, l'élève les
// fait (en ligne, ou sans connexion après l'avoir gardé) et la plateforme corrige et note.

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
};

async function workerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
}

test.afterAll(async () => {
  await closeDb();
});

/** Deux exercices publiés dans la banque (écrits par l'enseignant de démonstration). */
async function seedExercises(tag: string) {
  const [koffi] = await sql<{ id: string }>(
    `select id from users where oidc_subject = '10000000-0000-4000-8000-000000000002'`,
  );
  const [comp] = await sql<{ id: string }>(
    `select c.id from competencies c join curriculum_versions v on v.id = c.version_id
      where v.status = 'published' order by c.code limit 1`,
  );
  const insert = (title: string, kind: string, content: object) =>
    sql(
      `insert into exercises (organization_id, competency_id, domain, difficulty, skill, kind,
         title, content, status, author_id, published_at)
       values ('20000000-0000-4000-8000-000000000002', $1, 'nombres-operations', 'facile',
         'appliquer', $2, $3, $4, 'published', $5, now())`,
      [
        comp!.id,
        kind,
        title,
        JSON.stringify({ kind, explanation: '', media: null, ...content }),
        koffi!.id,
      ],
    );
  await insert(`Mangues ${tag}`, 'number', {
    prompt: '12 mangues pour 3 enfants : combien chacun ?',
    answer: 4,
    tolerance: 0,
    unit: 'mangues',
    explanation: '12 divisé par 3 font 4.',
  });
  await insert(`Carré ${tag}`, 'truefalse', {
    prompt: 'Un carré a quatre côtés égaux.',
    correct: true,
  });
}

/** L'enseignant donne un devoir à la classe CP1 A et y ajoute les deux exercices. */
async function giveAssignment(page: Page, title: string, tag: string) {
  await page.goto('/mon-espace/devoirs');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '+ Donner un devoir' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Classe')
    .selectOption(await dialog.getByRole('option', { name: /CP1 A/ }).getAttribute('value'));
  await dialog.getByLabel('Titre du devoir').fill(title);
  await dialog.getByLabel('Consigne').fill('Fais les deux exercices.');
  await dialog.getByRole('button', { name: 'Donner le devoir' }).click();
  await expect(page.getByText('Devoir donné.')).toBeVisible();
  await page
    .getByTestId('given-assignments')
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: /Corriger/ })
    .click();
  await page.getByLabel('Chercher', { exact: true }).fill(tag);
  await page.getByRole('button', { name: 'Chercher', exact: true }).click();

  for (const name of [`Mangues ${tag}`, `Carré ${tag}`]) {
    await page
      .getByTestId('exercise-candidates')
      .getByRole('button', { name: `Ajouter « ${name} »` })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Exercice ajouté' })).toBeVisible();
  }
  await expect(page.getByTestId('assignment-exercise-list').getByRole('listitem')).toHaveCount(2);
  return page.url().split('?')[0]!;
}

async function learnerPage(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  await loginAs(page, 'apprenant.demo', '/mon-espace/devoirs');
  return { context, page };
}

async function answer(page: Page, root = page) {
  await root.getByLabel('Ta réponse').fill('4');
  await root.getByRole('radio', { name: 'Faux' }).check();
}

test('un devoir d’exercices fait en ligne est corrigé et noté tout de suite', async ({
  browser,
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  await seedExercises(tag);
  const title = `Exercices en ligne ${tag}`;
  await loginAs(page, 'enseignant.demo', '/mon-espace/devoirs');
  const reviewUrl = await giveAssignment(page, title, tag);
  await axe(page);

  const { context, page: learner } = await learnerPage(browser, testInfo);
  await learner.waitForLoadState('networkidle');
  await learner
    .getByTestId('my-assignments')
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: /Faire le devoir \(2 exercices\)/ })
    .click();
  await expect(learner.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await answer(learner);
  await axe(learner);
  await learner.getByRole('button', { name: 'Rendre mon devoir' }).click();
  const results = learner.getByTestId('assignment-results');
  await expect(results).toContainText('Note : 10/20');
  await expect(results).toContainText('✓ réussi');
  await expect(results).toContainText('12 divisé par 3 font 4.');
  await learner.goto('/mon-espace/devoirs');
  await expect(
    learner.getByTestId('my-assignments').getByRole('listitem').filter({ hasText: title }),
  ).toContainText('Note : 10/20');
  await context.close();

  // L'enseignant voit la copie corrigée ; les exercices ne changent plus.
  await page.goto(reviewUrl);
  await expect(page.getByTestId('submissions')).toContainText('à revoir');
  await expect(page.getByTestId('assignment-exercise-list')).toContainText(
    'la liste ne change plus',
  );
  await expect(page.getByRole('button', { name: /Retirer/ })).toHaveCount(0);
});

test('un devoir d’exercices gardé se fait sans connexion et compte au retour', async ({
  browser,
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}-hl-${Date.now()}`;
  await seedExercises(tag);
  const title = `Exercices hors ligne ${tag}`;
  await loginAs(page, 'enseignant.demo', '/mon-espace/devoirs');
  await giveAssignment(page, title, tag);
  const [assignment] = await sql<{ id: string }>(`select id from assignments where title = $1`, [
    title,
  ]);
  const submissions = async () =>
    (
      await sql<{ score: number | null }>(
        `select score from assignment_submissions where assignment_id = $1`,
        [assignment!.id],
      )
    ).map((s) => s.score);

  const { context, page: learner } = await learnerPage(browser, testInfo);
  await learner.goto(`/mon-espace/devoirs/${assignment!.id}/faire`);
  await workerReady(learner);
  await learner.getByRole('button', { name: 'Garder ce devoir sur cet appareil' }).click();
  await expect(learner.getByTestId('keep-assignment-status')).toContainText(
    'Ce devoir est sur cet appareil',
  );

  // Plus de réseau : l'adresse du devoir ouvre le devoir gardé.
  await context.setOffline(true);
  await learner.goto(`/mon-espace/devoirs/${assignment!.id}/faire`);
  const offline = learner.getByTestId('offline-assignments');
  await expect(offline.getByRole('heading', { name: title })).toBeVisible();
  await answer(learner, offline);
  await offline.getByRole('button', { name: 'Rendre mon devoir' }).click();
  await expect(learner.getByTestId('assignment-queued')).toContainText('gardées sur cet appareil');
  expect(await submissions()).toEqual([]);

  // Retour du réseau : les réponses partent toutes seules, corrigées une seule fois.
  await context.setOffline(false);
  await expect.poll(submissions, { timeout: 15_000 }).toEqual([10]);
  await learner.goto(`/mon-espace/devoirs/${assignment!.id}/faire`);
  await expect(learner.getByTestId('assignment-results')).toContainText('Note : 10/20');
  await context.close();
});
