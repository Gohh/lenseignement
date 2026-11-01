import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql, subjectOf } from './support/db';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

/** Nouveau compte, rattaché avec ce rôle à une structure créée sous la DRENA de démonstration. */
async function newMember(page: Page, testInfo: TestInfo, role: string, type: string) {
  const stamp = `${Date.now() % 1000000}-${testInfo.project.name}-${testInfo.retry}`;
  const username = `nouveau.${role}-${stamp}`;
  await loginAs(page, username);
  await page.waitForLoadState('networkidle');
  await sql(
    `with drena as (
       select id from organizations
        where type = 'authority' and name like 'Direction régionale de démonstration%' limit 1),
     org as (
       insert into organizations (name, type, parent_id)
       select $2, $3, drena.id from drena returning id)
     insert into memberships (user_id, organization_id, role)
     select u.id, org.id, $4 from users u, org where u.oidc_subject = $1`,
    [subjectOf(username), `${type.toUpperCase()} ${stamp}`, type, role],
  );
  await page.goto('/mon-espace');
  await page.waitForLoadState('networkidle');
}

test.describe('Ce que voit chaque rôle', () => {
  test('l’APFC a son tableau de bord de chiffres anonymes', async ({ page }, testInfo) => {
    await newMember(page, testInfo, 'apfc', 'apfc');
    await expect(page.getByText('Aucun profil n’est encore attribué')).toHaveCount(0);
    await expect(page.getByText('Espace APFC')).toBeVisible();
    await expect(page.getByTestId('watch-tiles')).toContainText('Structures suivies');
    const menu = page.getByRole('navigation', { name: 'Menu de mon espace' });
    await expect(menu.getByRole('link', { name: 'Statistiques' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Équipe' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Voir les statistiques' }).click();
    await expect(page.getByRole('heading', { name: 'Statistiques anonymes' })).toBeVisible();
    await expect(page.getByText('Aucun nom ici')).toBeVisible();
  });

  test('l’éducateur voit le suivi de son établissement, sans statistiques', async ({
    page,
  }, testInfo) => {
    await newMember(page, testInfo, 'educateur', 'college');
    await expect(page.getByText('Espace Éducateur')).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Menu de mon espace' });
    await expect(menu.getByRole('link', { name: 'Suivi de l’établissement' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Statistiques' })).toHaveCount(0);
  });
});
