import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeDb, sql } from './support/db';

// Épreuve type PASEC/TIMSS/ENIA (étape 4a) : l'enseignant la compose depuis la banque publiée,
// la donne à sa classe ; l'élève la fait comme un devoir ; l'enseignant lit les résultats.

const loginAs = (page: Page, username: string, returnTo: string) =>
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

/** Quatre vrai/faux publiés en « Sciences » ; renvoie la version de programme utilisée. */
async function seedExercises(tag: string): Promise<string> {
  const [koffi] = await sql<{ id: string }>(
    `select id from users where oidc_subject = '10000000-0000-4000-8000-000000000002'`,
  );
  const [comp] = await sql<{ id: string; version_id: string }>(
    `select c.id, c.version_id from competencies c join curriculum_versions v on v.id = c.version_id
      where v.status = 'published' order by c.code limit 1`,
  );
  for (const [i, level] of ['facile', 'moyen', 'difficile', 'moyen'].entries()) {
    await sql(
      `insert into exercises (organization_id, competency_id, domain, difficulty, skill, kind,
         title, content, status, author_id, published_at)
       values ('20000000-0000-4000-8000-000000000002', $1, 'sciences', $2, 'connaitre',
         'truefalse', $3, $4, 'published', $5, now())`,
      [
        comp!.id,
        level,
        `Sciences ${i + 1} ${tag}`,
        JSON.stringify({
          kind: 'truefalse',
          explanation: '',
          media: null,
          prompt: 'L’eau bout à 100 degrés.',
          correct: true,
        }),
        koffi!.id,
      ],
    );
  }
  return comp!.version_id;
}

test('épreuve composée depuis la banque, passée par la classe, lue par domaine', async ({
  browser,
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const versionId = await seedExercises(tag);
  const title = `Épreuve de sciences ${tag}`;

  await loginAs(page, 'enseignant.demo', '/mon-espace/epreuves');
  await expect(page.getByRole('heading', { level: 1, name: 'Épreuves' })).toBeVisible();
  await page.getByRole('link', { name: 'Créer une épreuve' }).click();
  await page.getByRole('radio', { name: /^Libre/ }).check();
  await page.getByRole('spinbutton', { name: 'Sciences' }).fill('100');
  await page.getByLabel('Titre').fill(title);
  await page.getByLabel('Programme').selectOption(versionId);
  await page.getByLabel('Nombre de questions').fill('4');
  await page.getByLabel('Durée (minutes)').fill('20');
  await axe(page);
  await page.getByRole('button', { name: 'Composer l’épreuve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Épreuve composée' })).toBeVisible();
  await expect(page.getByTestId('exam-items').getByRole('listitem')).toHaveCount(4);
  await axe(page);

  await page.getByRole('checkbox', { name: /CP1 A/ }).check();
  await page.getByRole('button', { name: 'Donner l’épreuve' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Épreuve donnée à 1 classe' }),
  ).toBeVisible();
  await expect(page.getByText('ses questions ne changent plus')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remplacer/ })).toHaveCount(0);
  const examUrl = page.url().split('?')[0]!;

  // L'élève la trouve dans ses devoirs et la fait.
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const learner = await context.newPage();
  await loginAs(learner, 'apprenant.demo', '/mon-espace/devoirs');
  await learner.waitForLoadState('networkidle');
  await learner
    .getByTestId('my-assignments')
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: /Faire le devoir \(4 exercices\)/ })
    .click();
  const vrai = learner.getByRole('radio', { name: 'Vrai' });
  await expect(vrai).toHaveCount(4);
  for (let i = 0; i < 4; i++) await vrai.nth(i).check();
  await learner.getByRole('button', { name: 'Rendre mon devoir' }).click();
  await expect(learner.getByTestId('assignment-results')).toContainText('Note : 100/100');
  await context.close();

  // Résultats : un élève sur la classe, au-dessus du seuil, par domaine.
  await page.goto(examUrl);
  await page.getByRole('link', { name: 'Voir les résultats' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Résultats' })).toBeVisible();
  const kpis = page.getByTestId('exam-kpis');
  await expect(kpis).toContainText('Ont passé l’épreuve');
  await expect(kpis).toContainText('100 %');
  await expect(page.getByRole('img', { name: 'Sciences : 100 % des points' })).toBeVisible();
  await expect(
    page.getByText('Tous les élèves qui ont passé l’épreuve sont au-dessus'),
  ).toBeVisible();
  await axe(page);
});

test('épreuve sur papier : livret, corrigé, saisie des copies', async ({
  browser,
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}-papier-${Date.now()}`;
  const versionId = await seedExercises(tag);
  const title = `Épreuve papier ${tag}`;

  await loginAs(page, 'enseignant.demo', '/mon-espace/epreuves/nouvelle');
  await page.getByRole('radio', { name: /^Libre/ }).check();
  await page.getByRole('spinbutton', { name: 'Sciences' }).fill('100');
  await page.getByLabel('Titre').fill(title);
  await page.getByLabel('Programme').selectOption(versionId);
  await page.getByLabel('Nombre de questions').fill('4');
  await page.getByRole('button', { name: 'Composer l’épreuve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Épreuve composée' })).toBeVisible();
  const examUrl = page.url().split('?')[0]!;

  // Livret pour les élèves, corrigé pour l'enseignant.
  await page.getByRole('link', { name: 'Livret à imprimer' }).click();
  await expect(page.getByTestId('booklet-item')).toHaveCount(4);
  await expect(page.getByText('Nom et prénom')).toBeVisible();
  await axe(page);
  await page.getByRole('link', { name: 'Voir le corrigé' }).click();
  await expect(page.getByTestId('exam-answer-key')).toContainText('Vrai');
  await axe(page);

  // Donnée sur papier : l'élève ne la voit pas en ligne.
  await page.goto(examUrl);
  await page.getByRole('radio', { name: 'Sur papier (livret imprimé)' }).check();
  await page.getByRole('checkbox', { name: /CP1 A/ }).check();
  await page.getByRole('button', { name: 'Donner l’épreuve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'imprimez le livret' })).toBeVisible();

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const learner = await context.newPage();
  await loginAs(learner, 'apprenant.demo', '/mon-espace/devoirs');
  await learner.waitForLoadState('networkidle');
  await expect(learner.getByTestId('my-assignments')).not.toContainText(title);

  // Saisie : Awa a 3 réponses justes sur 4.
  await page.getByRole('link', { name: 'Saisir les copies' }).click();
  await expect(page.getByTestId('paper-grid')).toBeVisible();
  for (const q of [1, 2, 4]) {
    await page.getByRole('checkbox', { name: `Awa (fictive), question ${q} juste` }).check();
  }
  await axe(page);
  await page.getByRole('button', { name: 'Enregistrer les copies' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Copies enregistrées : 1' }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Awa \(fictive\)/ })).toContainText('75 / 100');

  // L'élève voit maintenant sa note ; les résultats se lisent comme en ligne.
  await learner.reload();
  await expect(
    learner.getByTestId('my-assignments').getByRole('listitem').filter({ hasText: title }),
  ).toContainText('75');
  await context.close();
  await page.goto(`${examUrl}/resultats`);
  await expect(page.getByTestId('exam-kpis')).toContainText('75 %');
});

test('un élève n’a pas accès aux épreuves', async ({ page }) => {
  await loginAs(page, 'apprenant.demo', '/mon-espace/epreuves');
  await expect(page.getByRole('link', { name: 'Créer une épreuve' })).toHaveCount(0);
  await expect(page.getByText('Aucune épreuve pour l’instant.')).toBeVisible();
});
