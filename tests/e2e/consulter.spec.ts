import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql, subjectOf } from './support/db';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Consulter', () => {
  test('la direction n’y a pas accès', async ({ page }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace/consulter/classes');
    await expect(page.getByText('réservée au superadministrateur')).toBeVisible();
  });

  test('l’administrateur consulte les classes et les cours, sans rien modifier', async ({
    page,
  }, testInfo: TestInfo) => {
    const stamp = `${Date.now() % 1000000}-${testInfo.project.name}-${testInfo.retry}`;
    const username = `nouveau.consulter-${stamp}`.toLowerCase();
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

    // Le groupe « Consulter » est replié par défaut.
    const menu = page.getByRole('navigation', { name: 'Menu de mon espace' });
    const group = menu.locator('details', { hasText: 'Consulter' });
    await expect(group).not.toHaveAttribute('open', '');
    await group.locator('summary').dispatchEvent('click');
    await group.getByRole('link', { name: 'Classes' }).click();

    await expect(page.getByRole('heading', { name: 'Classes', level: 1 })).toBeVisible();
    await expect(page.getByTestId('consult')).toContainText('CP1 A');
    await expect(page.getByRole('button', { name: /Modifier|Supprimer/ })).toHaveCount(0);

    await page
      .getByRole('navigation', { name: 'Que consulter' })
      .getByRole('link', { name: 'Cours' })
      .click();
    await expect(page.getByRole('heading', { name: 'Cours', level: 1 })).toBeVisible();
    await page.getByLabel('Rechercher dans la liste').fill('syllabes');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect(page.getByTestId('consult')).toContainText('syllabes');
  });
});
