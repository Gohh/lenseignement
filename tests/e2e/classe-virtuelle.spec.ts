import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Classe virtuelle', () => {
  test('l’enseignant programme une séance, l’élève la voit et peut la rejoindre', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const title = `Fractions ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;
    // La séance commence maintenant (heure de Greenwich) : le bouton « Rejoindre » est ouvert.
    const now = new Date().toISOString().slice(0, 16);

    await loginAs(page, 'enseignant.demo', '/mon-espace/classe');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '+ Programmer une séance' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Titre de la séance').fill(title);
    await dialog.getByLabel('Matière (facultatif)').fill('Mathématiques');
    await dialog.getByLabel('Date et heure').fill(now);
    await dialog.getByRole('button', { name: 'Programmer' }).click();
    await expect(page.getByText('Séance programmée.')).toBeVisible();
    await expect(page.getByTestId('upcoming-sessions')).toContainText(title);

    const learnerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const learner = await learnerContext.newPage();
    await loginAs(learner, 'apprenant.demo', '/mon-espace/classe');
    const item = learner
      .getByTestId('upcoming-sessions')
      .getByRole('listitem')
      .filter({ hasText: title });
    await expect(item).toContainText('Mathématiques');
    await expect(item.getByRole('link', { name: /Rejoindre la séance/ })).toHaveAttribute(
      'href',
      /^https:\/\/meet\.jit\.si\/lenseignement-[0-9a-f]{16}$/,
    );
    // Un élève ne programme ni n'annule.
    await expect(learner.getByRole('button', { name: '+ Programmer une séance' })).toHaveCount(0);
    await expect(item.getByRole('button', { name: /Annuler/ })).toHaveCount(0);

    const results = await new AxeBuilder({ page: learner })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await learnerContext.close();

    // L'enseignant annule : la séance disparaît.
    await page.reload();
    await page
      .getByTestId('upcoming-sessions')
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('button', { name: /Annuler/ })
      .click();
    await expect(page.getByText('Séance annulée.')).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
  });
});
