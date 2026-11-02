import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Campagne d'évaluation de zone (étape 4c-1) : la DRENA lance, toutes les classes du niveau la
// reçoivent, l'école choisit en ligne ou papier, l'élève compose sans voir sa note, la DRENA suit
// la participation puis clôt : la note s'ouvre.

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
};

test.afterAll(async () => {
  await closeDb();
});

async function newcomer(browser: Browser, testInfo: TestInfo, username: string, name: string) {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  await loginAs(page, username);
  await page.waitForLoadState('networkidle');
  const [user] = await sql<{ id: string }>(
    `update users set display_name = $2 where oidc_subject = $1 returning id`,
    [subjectOf(username), name],
  );
  return { context, page, id: user!.id };
}

/** Une DRENA neuve avec une école, une classe de CM1 et une épreuve de quatre vrai/faux. */
async function seedZone(tag: string, ids: { pilot: string; director: string; learner: string }) {
  const [drena] = await sql<{ id: string }>(
    `insert into organizations (name, type) values ($1, 'authority') returning id`,
    [`DRENA Campagne ${tag}`],
  );
  const [school] = await sql<{ id: string }>(
    `insert into organizations (name, type, parent_id) values ($1, 'primary', $2) returning id`,
    [`EPP Les Flamboyants ${tag}`, drena!.id],
  );
  const [cohort] = await sql<{ id: string }>(
    `insert into cohorts (organization_id, code, name, school_year, level)
     values ($1, 'CM1-A', 'CM1 A', '2026-2027', 'cm1') returning id`,
    [school!.id],
  );
  await sql(
    `insert into memberships (user_id, organization_id, role) values
       ($1, $4, 'gestionnaire'), ($2, $5, 'chef-etablissement'), ($3, $5, 'apprenant')`,
    [ids.pilot, ids.director, ids.learner, drena!.id, school!.id],
  );
  await sql(`update users set profiles = '{apprenant}' where id = $1`, [ids.learner]);
  await sql(`insert into cohort_members (cohort_id, user_id, role) values ($1, $2, 'apprenant')`, [
    cohort!.id,
    ids.learner,
  ]);
  const [comp] = await sql<{ id: string; version_id: string }>(
    `select c.id, c.version_id from competencies c join curriculum_versions v on v.id = c.version_id
      where v.status = 'published' order by c.code limit 1`,
  );
  const [exam] = await sql<{ id: string }>(
    `insert into exams (organization_id, author_id, title, model, curriculum_version_id, shares,
       question_count, duration_minutes)
     values ($1, $2, $3, 'libre', $4, '{"sciences":100}', 4, 20) returning id`,
    [school!.id, ids.director, `Sciences CM1 ${tag}`, comp!.version_id],
  );
  for (const i of [1, 2, 3, 4]) {
    const [ex] = await sql<{ id: string }>(
      `insert into exercises (organization_id, competency_id, domain, difficulty, skill, kind,
         title, content, status, author_id, published_at)
       values ($1, $2, 'sciences', 'moyen', 'connaitre', 'truefalse', $3, $4, 'published', $5, now())
       returning id`,
      [
        school!.id,
        comp!.id,
        `Sciences ${i} ${tag}`,
        JSON.stringify({
          kind: 'truefalse',
          explanation: '',
          media: null,
          prompt: 'Les plantes ont besoin de lumière.',
          correct: true,
        }),
        ids.director,
      ],
    );
    await sql(`insert into exam_items (exam_id, exercise_id, position) values ($1, $2, $3)`, [
      exam!.id,
      ex!.id,
      i,
    ]);
  }
}

test('campagne de zone : lancée, passée, suivie, close', async ({ browser, page }, testInfo) => {
  // Une campagne touche toutes les classes du niveau : un seul navigateur la lance.
  test.skip(testInfo.project.name !== 'desktop');
  const tag = `${Date.now() % 1000000}-${testInfo.retry}`;
  const pilotName = `nouveau.drena-${tag}`;
  await loginAs(page, pilotName);
  await page.waitForLoadState('networkidle');
  const [pilot] = await sql<{ id: string }>(
    `update users set display_name = 'Gestionnaire (fictif)' where oidc_subject = $1 returning id`,
    [subjectOf(pilotName)],
  );
  const director = await newcomer(browser, testInfo, `nouveau.dir-${tag}`, 'Direction (fictive)');
  const learner = await newcomer(browser, testInfo, `nouveau.eleve-${tag}`, 'Fanta (fictive)');
  await seedZone(tag, { pilot: pilot!.id, director: director.id, learner: learner.id });
  const title = `Évaluation CM1 ${tag}`;

  // La DRENA lance la campagne : elle voit d'abord combien de classes la reçoivent.
  await page.goto('/mon-espace');
  await page
    .getByRole('navigation', { name: 'Menu de mon espace' })
    .getByRole('link', { name: 'Campagnes d’évaluation' })
    .click();
  await page.getByRole('link', { name: 'Lancer une campagne', exact: true }).click();
  await page.getByLabel('Titre de la campagne').fill(title);
  await page
    .getByLabel('Épreuve')
    .selectOption({ label: `Sciences CM1 ${tag} · 4 questions · EPP Les Flamboyants ${tag}` });
  await page.getByLabel('Zone').selectOption({ label: `DRENA Campagne ${tag}` });
  await page.getByLabel('Niveau').selectOption('cm1');
  await page.getByRole('button', { name: 'Voir les classes concernées' }).click();
  const preview = page.getByTestId('campaign-preview');
  await expect(preview).toContainText('1école');
  await expect(preview).toContainText('1classe');
  await axe(page);
  await preview.getByRole('button', { name: 'Lancer la campagne' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Campagne lancée : 1 classe' }),
  ).toBeVisible();
  await expect(page.getByTestId('campaign-kpis')).toContainText('0 %');
  await expect(page.getByTestId('campaign-groups')).toContainText('Sans IEPP');
  await expect(page.getByTestId('campaign-schools')).toContainText('En retard');
  await axe(page);
  const campaignPath = new URL(page.url()).pathname;

  // L'école la voit pour sa classe et garde « en ligne ».
  await director.page.goto(campaignPath);
  const myClasses = director.page.getByTestId('campaign-my-classes');
  await expect(myClasses).toContainText('CM1 A');
  await expect(myClasses.getByRole('radio', { name: 'En ligne' })).toBeChecked();
  await axe(director.page);
  await director.page.getByRole('link', { name: 'Livret à imprimer' }).click();
  await expect(director.page.getByTestId('booklet-item')).toHaveCount(4);

  // L'élève compose : sa copie est rendue, sa note reste cachée.
  await loginAs(learner.page, `nouveau.eleve-${tag}`, '/mon-espace/devoirs');
  await learner.page.waitForLoadState('networkidle');
  await learner.page
    .getByTestId('my-assignments')
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: /Faire le devoir \(4 exercices\)/ })
    .click();
  await expect(
    learner.page.getByText('Ta note sera visible à la fin de l’évaluation'),
  ).toBeVisible();
  const vrai = learner.page.getByRole('radio', { name: 'Vrai' });
  for (let i = 0; i < 3; i++) await vrai.nth(i).check();
  await learner.page.getByRole('radio', { name: 'Faux' }).nth(3).check();
  await learner.page.getByRole('button', { name: 'Rendre mon devoir' }).click();
  await expect(learner.page.getByTestId('results-hidden')).toBeVisible();
  await expect(learner.page.getByText('Note :')).toHaveCount(0);
  await axe(learner.page);

  // La DRENA suit : 100 % ont composé ; elle clôt, la note s'ouvre.
  await page.reload();
  await expect(page.getByTestId('campaign-kpis')).toContainText('100 %');
  await expect(page.getByTestId('campaign-schools')).toContainText('Bon');
  await page.getByRole('button', { name: 'Clore la campagne' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Campagne close' })).toBeVisible();
  await expect(page.getByTestId('campaign-schools')).toContainText('Évaluée');

  // Résultats dans le tableau de pilotage, sans nom d'élève ; une seule copie : moyenne masquée.
  await page.getByRole('link', { name: 'Voir les résultats par domaine, zone et école' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Résultats · ${title}` })).toBeVisible();
  await expect(page.getByTestId('campaign-results-kpis')).toContainText('1 élèves sur 1');
  await expect(page.getByTestId('campaign-results-kpis')).toContainText('moins de 5 copies');
  await expect(page.getByTestId('campaign-results-schools')).toContainText(
    `EPP Les Flamboyants ${tag}`,
  );
  await expect(page.getByText('Fanta (fictive)')).toHaveCount(0);
  await axe(page);
  const excel = await page.request.get(`${new URL(page.url()).pathname}/export`);
  expect(excel.status()).toBe(200);
  expect(excel.headers()['content-type']).toContain('spreadsheetml');
  await page.goto('/mon-espace/statistiques');
  await expect(page.getByTestId('stats-campaigns')).toContainText(title);

  await learner.page.goto('/mon-espace/devoirs');
  await expect(
    learner.page.getByTestId('my-assignments').getByRole('listitem').filter({ hasText: title }),
  ).toContainText('Note : 75/100');
  await learner.context.close();
  await director.context.close();
});

test('un élève ne lance pas de campagne', async ({ page }) => {
  await loginAs(page, 'apprenant.demo', '/mon-espace/campagnes');
  await expect(page.getByRole('link', { name: 'Lancer une campagne' })).toHaveCount(0);
  await expect(page.getByText('Aucune campagne ne concerne vos classes')).toBeVisible();
});
