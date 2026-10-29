import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const fresh = (prefix: string, testInfo: TestInfo) =>
  `${prefix}.${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu de mon espace' });

test.describe('Profils à l’inscription', () => {
  test('le parent choisit son profil : son menu a « Ma famille », pas « Mes élèves »', async ({
    page,
  }, testInfo) => {
    await loginAs(page, fresh('nouveau-parent', testInfo), '/mon-espace/bienvenue');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenue');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('Choisissez au moins un profil.')).toBeVisible();

    await page.getByLabel(/Je suis parent ou tuteur/).check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ma famille' })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Ma famille' })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Mes élèves' })).toHaveCount(0);
  });

  test('un compte peut cumuler parent et répétiteur', async ({ page }, testInfo) => {
    await loginAs(page, fresh('nouveau-parent', testInfo), '/mon-espace/bienvenue');
    await page.getByLabel(/Je suis parent ou tuteur/).check();
    await page.getByLabel(/Je suis répétiteur/).check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.goto('/mon-espace');
    await expect(menu(page).getByRole('link', { name: 'Ma famille' })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Mes élèves' })).toBeVisible();
  });

  test('l’élève de primaire ne s’inscrit pas seul : son parent crée son profil', async ({
    page,
  }, testInfo) => {
    await loginAs(page, fresh('nouveau', testInfo), '/mon-espace/bienvenue');
    await page.getByLabel(/Je suis apprenant/).check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByText('Primaire', { exact: true }).click();
    await page.getByText('CM1', { exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/c’est un parent qui crée le profil de l’enfant/)).toBeVisible();

    // Au collège, il choisit lui-même.
    await page.getByText('Collège', { exact: true }).click();
    await page.getByText('6e', { exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page).toHaveURL(/\/catalogue$/);
  });
});
