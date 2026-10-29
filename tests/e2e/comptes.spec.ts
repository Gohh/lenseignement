import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Créer un compte', () => {
  test('la direction ouvre « Créer un compte » ; sans réglage Keycloak, un message guide', async ({
    page,
  }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace/equipe');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '+ Créer un compte' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('réglage unique dans Keycloak');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
