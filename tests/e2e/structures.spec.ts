import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql, subjectOf } from './support/db';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Services et partenaires', () => {
  test('le superadministrateur crée une IEPP dans une DRENA et un cabinet national', async ({
    page,
  }, testInfo: TestInfo) => {
    const username = `nouveau.structures-${Date.now() % 1000000}-${testInfo.retry}`;
    await loginAs(page, username);
    await page.waitForLoadState('networkidle');
    await sql(
      `insert into memberships (user_id, organization_id, role)
       select u.id, o.id, 'superadministrateur' from users u, organizations o
        where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
      [subjectOf(username)],
    );
    const suffix = `${testInfo.project.name}-${Date.now() % 1000000}`;
    await page.goto('/mon-espace/configuration');
    await page
      .getByRole('navigation', { name: 'Réseau scolaire' })
      .getByRole('link', { name: 'Services et partenaires' })
      .click();
    await expect(
      page.getByRole('heading', { name: /Services et partenaires actifs/ }),
    ).toBeVisible();

    // Une IEPP sans DRENA est refusée, la fenêtre se rouvre avec le message.
    await page.getByRole('button', { name: '+ Créer une structure' }).click();
    const dialog = page.getByRole('dialog', { name: 'Créer un service ou un partenaire' });
    await dialog.getByLabel(/Inspection de l’enseignement préscolaire/).check();
    await dialog.getByLabel('Nom officiel').fill(`IEPP Essai ${suffix}`);
    await dialog.getByRole('button', { name: 'Créer la structure' }).click();
    await expect(page.getByText('La direction régionale est obligatoire.')).toBeVisible();

    const reopened = page.getByRole('dialog', { name: 'Créer un service ou un partenaire' });
    await reopened.getByLabel(/Inspection de l’enseignement préscolaire/).check();
    await reopened.getByLabel('Nom officiel').fill(`IEPP Essai ${suffix}`);
    await reopened
      .getByLabel('DRENA de rattachement')
      .selectOption({ label: 'Direction régionale de démonstration (fictive)' });
    await reopened.getByRole('button', { name: 'Créer la structure' }).click();
    await expect(
      page.getByText(`Structure créée (IEPP) : « IEPP Essai ${suffix} ».`),
    ).toBeVisible();

    await page.getByRole('button', { name: '+ Créer une structure' }).click();
    const again = page.getByRole('dialog', { name: 'Créer un service ou un partenaire' });
    await again.getByLabel('Cabinet du ministère').check();
    await again.getByLabel('Nom officiel').fill(`Cabinet Essai ${suffix}`);
    await again.getByRole('button', { name: 'Créer la structure' }).click();
    await expect(page.getByText(`Structure créée (Cabinet)`)).toBeVisible();

    const list = page.getByTestId('service-list');
    const ieppRow = list.getByRole('row', { name: new RegExp(`IEPP Essai ${suffix}`) });
    await expect(ieppRow).toContainText('Direction régionale de démonstration');
    await expect(
      list.getByRole('row', { name: new RegExp(`Cabinet Essai ${suffix}`) }),
    ).toContainText('National');
    await testInfo.attach('services', { body: await page.screenshot({ fullPage: true }) });

    // La fiche : pas de classes ; le retour mène à l'onglet.
    await ieppRow.getByRole('link', { name: `IEPP Essai ${suffix}`, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `IEPP Essai ${suffix}`, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Classes' })).toHaveCount(0);
    await expect(page.getByTestId('organization-counts')).toContainText('dans l’équipe');
    await page.getByRole('link', { name: '← Services et partenaires' }).click();
    await expect(page).toHaveURL(/\/configuration\/services$/);
    await expect(page.getByTestId('service-list')).toBeVisible();

    // L'onglet Établissements ne les montre pas.
    await page
      .getByRole('navigation', { name: 'Réseau scolaire' })
      .getByRole('link', { name: 'Établissements', exact: true })
      .click();
    await expect(page.getByText(`IEPP Essai ${suffix}`)).toHaveCount(0);
  });
});
