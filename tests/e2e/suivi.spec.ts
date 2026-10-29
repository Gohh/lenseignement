import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Suivi de l’établissement', () => {
  test('la direction voit ses classes et les élèves à suivre', async ({ page }) => {
    await loginAs(page, 'directeur.demo');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Suivi de l’établissement' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Suivi de l’établissement');
    await expect(page.getByTestId('totals')).toContainText('Élèves à suivre');
    await expect(page.getByTestId('direction-classes')).toContainText('CP1 A');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('l’enseignant n’y a pas accès', async ({ page }) => {
    await loginAs(page, 'enseignant.demo', '/mon-espace/suivi');
    await expect(page.getByText('réservée à la direction')).toBeVisible();
  });
});
