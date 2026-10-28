import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('E2E-01 : le premier geste utile est accessible en une interaction', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Alphabétisation', exact: true }).click();
  await expect(page).toHaveURL(/\/branches\/alphabetisation$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Alphabétisation' })).toBeVisible();
});

test('« Choisis ton niveau » mène au catalogue déjà filtré', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Primaire CP2' }).click();
  await expect(page).toHaveURL(/\/catalogue\?level=cp2$/);
  await expect(page.getByLabel('Niveau ou classe')).toHaveValue('cp2');
});

test('le lien d’évitement mène au contenu au clavier', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});

test('le badge hors ligne s’affiche quand le réseau est coupé', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Hors ligne')).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByText('Hors ligne')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('Hors ligne')).toHaveCount(0);
});

for (const path of ['/', '/branches/technique']) {
  test(`E2E-16 : aucune violation axe WCAG A/AA sur ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
