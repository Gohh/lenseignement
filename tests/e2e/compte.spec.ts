import { expect, test, type Page } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Mon compte', () => {
  test('le cycle choisi fait apparaître ses niveaux, et le niveau est gardé', async ({
    page,
  }, testInfo) => {
    await loginAs(
      page,
      `nouveau.compte${testInfo.project.name}${Date.now()}`,
      '/mon-espace/compte?bienvenue=1&next=/catalogue',
    );
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenue');

    // Aucun niveau tant qu'aucun cycle n'est choisi.
    await expect(page.getByRole('radio', { name: 'CM1' })).toHaveCount(0);
    await page.getByText('Primaire', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'CM1' })).toBeAttached();
    await expect(page.getByRole('radio', { name: '6e' })).toHaveCount(0);
    await page.getByText('CM1', { exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page).toHaveURL(/\/catalogue$/);

    await page.goto('/mon-espace/compte');
    await expect(page.getByText('Niveau actuel : Primaire CM1.')).toBeVisible();
  });
});
