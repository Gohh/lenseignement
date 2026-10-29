import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Mes réussites', () => {
  test('l’élève voit ses compteurs et ses badges', async ({ page }) => {
    await page.goto('/auth/login?returnTo=/mon-espace&login_hint=apprenant.demo');
    await page.getByRole('link', { name: 'Mes réussites' }).first().click();
    await expect(page.getByRole('heading', { name: 'Mes réussites', level: 1 })).toBeVisible();
    await expect(page.getByTestId('achievement-stats')).toContainText('leçon');
    await expect(page.getByTestId('badges').getByRole('listitem')).toHaveCount(5);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
