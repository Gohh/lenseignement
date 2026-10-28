import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Cours fictif publié « Additionner jusqu'à 10 », avec quiz : apps/api/src/courses/demo-courses.ts.
const COURSE = '50000000-0000-4000-8000-000000000005';

const freshLearner = (testInfo: TestInfo) =>
  `nouveau.q${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Quiz des leçons (ticket 13)', () => {
  test('un visiteur répond au quiz et reçoit la correction expliquée', async ({ page }) => {
    await page.goto(`/catalogue/${COURSE}/lecons/1`);
    await expect(page.getByRole('heading', { name: 'Quiz de la leçon' })).toBeVisible();
    await expect(page.getByText('Vos réponses sont corrigées mais pas enregistrées')).toBeVisible();

    const q1 = page.getByRole('group', { name: /Question 1/ });
    const q2 = page.getByRole('group', { name: /Question 2/ });
    await q1.getByLabel('Trois').check();
    await q2.getByLabel('Six').check();
    await page.getByRole('button', { name: 'Valider mes réponses' }).click();

    await expect(page.getByTestId('quiz-score')).toHaveText('Résultat : 1 sur 2.');
    await expect(q1.getByTestId('quiz-feedback')).toContainText('✓ Bonne réponse.');
    await expect(q2.getByTestId('quiz-feedback')).toContainText('✗ La bonne réponse était : Cinq.');
    await expect(q2.getByTestId('quiz-feedback')).toContainText('quatre et un font cinq');

    await page.getByRole('button', { name: 'Recommencer le quiz' }).click();
    await expect(page.getByTestId('quiz-feedback')).toHaveCount(0);
    await expect(q1.getByLabel('Trois')).not.toBeChecked();
  });

  test('un apprenant inscrit garde son dernier résultat', async ({ page }, testInfo) => {
    await loginAs(page, freshLearner(testInfo), `/catalogue/${COURSE}`);
    await page.getByRole('button', { name: 'Suivre ce cours' }).click();
    await expect(page.getByTestId('course-progress')).toBeVisible();

    await page.goto(`/catalogue/${COURSE}/lecons/2`);
    await expect(page.getByTestId('quiz-last')).toHaveCount(0);
    await page
      .getByRole('group', { name: /Question 1/ })
      .getByLabel('Cinq')
      .check();
    await page.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(page.getByTestId('quiz-score')).toHaveText('Résultat : 1 sur 1. Bravo !');

    await page.reload();
    await expect(page.getByTestId('quiz-last')).toHaveText('Votre dernier résultat : 1 sur 1.');
  });

  test('un enseignant ajoute une question à une leçon', async ({ page }, testInfo) => {
    const title = `Quiz E2E ${testInfo.project.name} ${Date.now()}`;
    await loginAs(page, 'enseignant.demo', '/mon-espace/cours/nouveau');
    await page.getByLabel('Titre du cours').fill(title);
    await page.getByRole('button', { name: 'Créer le brouillon' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);

    // Page rechargée : la redirection après un enregistrement peut encore re-rendre l'éditeur
    // et effacer un ajout ; après rechargement (et chargement des scripts), la page est stable.
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Ajouter un module' }).click();
    await page.getByLabel('Titre du module 1').fill('Additions');
    await page.getByRole('button', { name: 'Ajouter une leçon au module 1' }).click();
    await page.getByLabel('Leçon 1.1 : titre').fill('Un et un');
    await page.getByLabel('Leçon 1.1 : contenu').fill('Un doigt et un doigt : deux doigts.');
    await page.getByRole('button', { name: /Ajouter une question/ }).click();
    await page.getByLabel('Leçon 1.1, question 1 : énoncé').fill('Un et un font combien ?');
    await page.getByLabel('Leçon 1.1, question 1, choix 1', { exact: true }).fill('Un');
    await page.getByLabel('Leçon 1.1, question 1, choix 2', { exact: true }).fill('Deux');
    await page
      .getByRole('radio', { name: /Bonne réponse : Leçon 1\.1, question 1, choix 2/ })
      .check();
    await page
      .getByLabel('Leçon 1.1, question 1 : explication montrée après la réponse')
      .fill('On compte un, puis deux.');
    await page.getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(page.getByTestId('outline-status')).toHaveText('Plan enregistré.');

    await page.reload();
    await expect(page.getByLabel('Leçon 1.1, question 1 : énoncé')).toHaveValue(
      'Un et un font combien ?',
    );
    await expect(
      page.getByRole('radio', { name: /Bonne réponse : Leçon 1\.1, question 1, choix 2/ }),
    ).toBeChecked();
  });

  test('E2E-16 : quiz corrigé sans violation axe WCAG A/AA', async ({ page }) => {
    await loginAs(page, 'apprenant.demo', `/catalogue/${COURSE}/lecons/2`);
    await page
      .getByRole('group', { name: /Question 1/ })
      .getByLabel('Quatre')
      .check();
    await page.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(page.getByTestId('quiz-score')).toHaveText('Résultat : 0 sur 1.');
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});
