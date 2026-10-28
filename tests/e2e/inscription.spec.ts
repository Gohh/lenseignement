import { expect, test } from '@playwright/test';
import { OIDC_URL } from './support/urls';

// Cours fictif publié « Les nombres jusqu'à 50 » : apps/api/src/courses/demo-courses.ts.
const COURSE = '50000000-0000-4000-8000-000000000003';

test.describe('Inscription progressive (ADR-018)', () => {
  test('« Créer mon compte » ouvre la création de compte du fournisseur', async ({ page }) => {
    await page.goto('/');
    const authorize = page.waitForRequest((req) => req.url().startsWith(`${OIDC_URL}/authorize`));
    await page.getByRole('link', { name: 'Créer mon compte' }).click();
    expect(new URL((await authorize).url()).searchParams.get('prompt')).toBe('create');
  });

  test('après la leçon 1, le compte ramène le visiteur à la leçon 2', async ({ page }) => {
    await page.goto(`/catalogue/${COURSE}/lecons/2`);
    await expect(
      page.getByRole('heading', { name: 'Crée ton compte pour continuer' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'J’ai déjà un compte' }).click();
    await expect(page).toHaveURL(new RegExp(`/catalogue/${COURSE}/lecons/2$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Additionner deux petits nombres',
    );
  });
});
