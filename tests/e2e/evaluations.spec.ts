import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Évaluations', () => {
  test('l’enseignant crée une évaluation et saisit les notes, l’élève voit sa note', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const title = `Contrôle ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;

    await loginAs(page, 'enseignant.demo', '/mon-espace/evaluations');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '+ Créer une évaluation' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Titre').fill(title);
    await dialog.getByLabel('Date').fill('2026-10-20');
    await dialog.getByRole('button', { name: 'Créer l’évaluation' }).click();
    await expect(page.getByText('Évaluation créée.')).toBeVisible();

    await page
      .getByTestId('given-evaluations')
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('link', { name: /Saisir les notes/ })
      .click();
    const first = page.getByTestId('score-sheet').getByRole('listitem').first();
    await first.getByRole('spinbutton').fill('15.5');
    await page.getByRole('button', { name: 'Enregistrer les notes' }).click();
    await expect(page.getByText('Notes enregistrées.')).toBeVisible();

    const learnerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const learner = await learnerContext.newPage();
    await loginAs(learner, 'apprenant.demo', '/mon-espace/evaluations');
    await learner.waitForLoadState('networkidle');
    const mine = learner
      .getByTestId('my-evaluations')
      .getByRole('listitem')
      .filter({ hasText: title });
    await expect(mine.getByTestId('my-score')).toContainText('15,5');
    await expect(learner.getByTestId('average')).toBeVisible();
    const results = await new AxeBuilder({ page: learner })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await learnerContext.close();

    // Nettoyage.
    await page.goto('/mon-espace/evaluations');
    await page
      .getByTestId('given-evaluations')
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('button', { name: /Supprimer/ })
      .click();
    await expect(page.getByText('Évaluation supprimée.')).toBeVisible();
  });
});
