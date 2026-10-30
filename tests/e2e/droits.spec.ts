import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql, subjectOf } from './support/db';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Droits', () => {
  test('la direction n’y a pas accès', async ({ page }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace/droits');
    await expect(page.getByText('réservée au superadministrateur')).toBeVisible();
  });

  test('le superadministrateur retire un droit puis le rend', async ({
    page,
  }, testInfo: TestInfo) => {
    // Une seule liste de droits pour toute la plateforme : un seul navigateur la modifie.
    test.skip(testInfo.project.name !== 'desktop');
    const username = `nouveau.droits-${Date.now() % 1000000}-${testInfo.retry}`;
    await loginAs(page, username);
    await page.waitForLoadState('networkidle');
    await sql(
      `insert into memberships (user_id, organization_id, role)
       select u.id, o.id, 'superadministrateur' from users u, organizations o
        where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
      [subjectOf(username)],
    );
    await page.goto('/mon-espace');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('navigation', { name: 'Menu de mon espace' })
      .getByRole('link', { name: 'Droits' })
      .click();
    await expect(page.getByRole('heading', { name: 'Droits', level: 1 })).toBeVisible();

    const box = page.getByLabel('Consulter : Administrateur');
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.getByRole('button', { name: 'Enregistrer les droits' }).click();
    await expect(page.getByText('Droits enregistrés.')).toBeVisible();
    await expect(page.getByLabel('Consulter : Administrateur')).not.toBeChecked();

    await page.getByLabel('Consulter : Administrateur').check();
    await page.getByRole('button', { name: 'Enregistrer les droits' }).click();
    await expect(page.getByText('Droits enregistrés.')).toBeVisible();
    await expect(page.getByLabel('Consulter : Administrateur')).toBeChecked();
  });
});
