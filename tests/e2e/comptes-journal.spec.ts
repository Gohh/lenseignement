import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql, subjectOf } from './support/db';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Comptes et journal des actions', () => {
  test('la direction n’y a pas accès', async ({ page }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace/comptes');
    await expect(page.getByText('réservée au superadministrateur')).toBeVisible();
    await page.goto('/mon-espace/journal');
    await expect(page.getByText('réservé au superadministrateur')).toBeVisible();
  });

  test('le superadministrateur suspend un compte, le réactive, et le retrouve au journal', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const stamp = `${Date.now() % 1000000}-${testInfo.project.name}-${testInfo.retry}`;
    // Un compte à suspendre, avec un nom qu'on retrouve.
    const target = `nouveau.cible-${stamp}`.toLowerCase();
    const targetContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const targetPage = await targetContext.newPage();
    await loginAs(targetPage, target);
    await targetPage.waitForLoadState('networkidle');
    const name = `Cible ${stamp}`;
    await sql(`update users set display_name = $2 where oidc_subject = $1`, [
      subjectOf(target),
      name,
    ]);

    const username = `nouveau.superadmin-${stamp}`.toLowerCase();
    await loginAs(page, username);
    await page.waitForLoadState('networkidle');
    await sql(
      `insert into memberships (user_id, organization_id, role)
       select u.id, o.id, 'superadministrateur' from users u, organizations o
        where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
      [subjectOf(username)],
    );

    await page.goto(`/mon-espace/comptes?q=${encodeURIComponent(name)}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('account-total')).toHaveText('1 compte');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.getByRole('button', { name: `Suspendre ${name}` }).click();
    await expect(page.getByText('Compte suspendu.')).toBeVisible();
    await expect(page.getByTestId('accounts')).toContainText('Suspendu');

    await page.getByRole('button', { name: `Réactiver ${name}` }).click();
    await expect(page.getByText('Compte réactivé.')).toBeVisible();
    await targetContext.close();

    // Modifier : compléter le nom affiché.
    const row = page.getByTestId('accounts').locator(':scope > li').filter({ hasText: name });
    await row.getByRole('button', { name: 'Modifier' }).click();
    const edit = page.getByRole('dialog');
    await edit.getByLabel('Nom affiché').fill(`${name} Koné`);
    await edit.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Compte modifié.')).toBeVisible();
    await expect(page.getByTestId('accounts')).toContainText(`${name} Koné`);
    // Ce compte a servi : pas de suppression possible.
    await expect(page.getByRole('button', { name: `Supprimer ${name} Koné` })).toHaveCount(0);

    // Un compte jamais utilisé se supprime.
    const unused = `Jamais connecté ${stamp}`;
    await sql(`insert into users (oidc_subject, display_name) values ($1, $2)`, [
      `inutilise-${stamp}`,
      unused,
    ]);
    await page.goto(`/mon-espace/comptes?q=${encodeURIComponent(unused)}`);
    await page.getByRole('button', { name: `Supprimer ${unused}` }).click();
    await expect(page.getByText(/Compte supprimé/)).toBeVisible();
    await expect(page.getByTestId('account-total')).toHaveText('0 compte');

    await page.goto('/mon-espace/journal?domaine=account');
    await expect(page.getByTestId('journal')).toContainText('Compte suspendu');
    await expect(page.getByTestId('journal')).toContainText('Compte réactivé');
  });
});
