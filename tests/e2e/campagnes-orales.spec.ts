import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Campagne orale de zone (étape 5b) : la DRENA lance une épreuve orale publiée, l'enseignant la
// fait passer dans sa classe depuis « Évaluations orales », la DRENA suit la participation, clôt,
// puis lit les résultats anonymes dans le tableau de pilotage.

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

test('campagne orale : lancer, faire passer, clore, lire les résultats', async ({
  browser,
}, testInfo) => {
  const tag = `${Date.now() % 1000000}-${testInfo.project.name}`.toLowerCase();
  const pilot = await newcomer(browser, testInfo, `nouveau.drena-orale-${tag}`, `DRENA ${tag}`);
  const teacher = await newcomer(browser, testInfo, `nouveau.maitre-oral-${tag}`, `Maître ${tag}`);
  const learner = await newcomer(browser, testInfo, `nouveau.eleve-oral-${tag}`, `Élève ${tag}`);

  const [drena] = await sql<{ id: string }>(
    `insert into organizations (name, type) values ($1, 'authority') returning id`,
    [`DRENA Orale ${tag}`],
  );
  const [school] = await sql<{ id: string }>(
    `insert into organizations (name, type, parent_id) values ($1, 'primary', $2) returning id`,
    [`EPP Les Palmiers ${tag}`, drena!.id],
  );
  const [cohort] = await sql<{ id: string }>(
    `insert into cohorts (organization_id, code, name, school_year, level)
     values ($1, 'CE1-A', 'CE1 A', '2026-2027', 'ce1') returning id`,
    [school!.id],
  );
  await sql(
    `insert into memberships (user_id, organization_id, role) values
       ($1, $4, 'gestionnaire'), ($2, $5, 'enseignant'), ($3, $5, 'apprenant')`,
    [pilot.id, teacher.id, learner.id, drena!.id, school!.id],
  );
  await sql(
    `insert into cohort_members (cohort_id, user_id, role) values ($1, $2, 'enseignant'), ($1, $3, 'apprenant')`,
    [cohort!.id, teacher.id, learner.id],
  );
  const title = `Lecture CE1 ${tag}`;
  await sql(
    `insert into oral_tests (organization_id, author_id, title, subject, level, parts, status, published_at)
     values ($1, $2, $3, 'lecture', 'ce1', $4, 'publiee', now())`,
    [
      school!.id,
      teacher.id,
      title,
      JSON.stringify([
        {
          kind: 'grille',
          title: 'Mots',
          instruction: 'Lis ces mots.',
          items: ['la', 'le', 'un', 'il', 'papa', 'ami'],
          text: '',
          questions: [],
          seconds: 60,
          reference: true,
        },
      ]),
    ],
  );
  await learner.context.close();

  // La DRENA lance la campagne orale.
  const page = pilot.page;
  await page.goto('/mon-espace/campagnes');
  await page.getByRole('link', { name: 'Lancer une campagne orale' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Lancer une campagne orale' }),
  ).toBeVisible();
  const campaignTitle = `Campagne orale ${tag}`;
  await page.getByLabel('Titre de la campagne').fill(campaignTitle);
  await page
    .getByLabel('Épreuve orale')
    .selectOption({ label: `${title} · Primaire CE1 · EPP Les Palmiers ${tag}` });
  await page.getByLabel('Zone').selectOption(drena!.id);
  await page.getByLabel('Niveau').selectOption('ce1');
  await page.getByRole('button', { name: 'Voir les classes concernées' }).click();
  await expect(page.getByTestId('campaign-preview')).toContainText('1');
  await axe(page);
  await page.getByRole('button', { name: 'Lancer la campagne' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Campagne orale lancée' })).toBeVisible();
  await expect(page.getByTestId('oral-campaign-schools')).toContainText(`EPP Les Palmiers ${tag}`);
  await axe(page);
  const campaignUrl = new URL(page.url()).pathname;

  // L'enseignant la trouve dans ses évaluations orales et la fait passer.
  const t = teacher.page;
  await t.goto('/mon-espace/oral');
  const box = t.getByTestId('oral-campaigns');
  await expect(box).toContainText(campaignTitle);
  await box.getByRole('link', { name: /Faire passer en CE1 A/ }).click();
  await t.getByTestId('oral-learner').first().click();
  await t.getByTestId('oral-start').click();
  await t.getByTestId('oral-item').nth(1).click();
  await t.getByTestId('oral-finish').click();
  await t.getByTestId('oral-last').click();
  await t.getByTestId('oral-save').click();
  await expect(t.getByTestId('oral-saved')).toHaveText('Résultat enregistré.');
  await t.goto(campaignUrl);
  await expect(t.getByTestId('oral-campaign-my-classes')).toContainText('1 élève évalué sur 1');
  await teacher.context.close();

  // La DRENA suit, clôt et lit les résultats.
  await page.reload();
  await expect(page.getByTestId('oral-campaign-kpis')).toContainText('100 %');
  await page.getByRole('button', { name: 'Clore la campagne' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Campagne orale close' })).toBeVisible();
  await page.getByRole('link', { name: 'Voir les résultats par zone et par école' }).click();
  await expect(page.getByTestId('oral-campaign-results-kpis')).toContainText('1 sur 1');
  await expect(page.getByTestId('oral-campaign-results-schools')).toContainText(
    'moins de 5 élèves',
  );
  await axe(page);
  const excel = await page.request.get(`${new URL(page.url()).pathname}/export`);
  expect(excel.status()).toBe(200);
  await page.goto('/mon-espace/statistiques');
  await expect(page.getByTestId('stats-campaigns')).toContainText(campaignTitle);
  await pilot.context.close();
});
