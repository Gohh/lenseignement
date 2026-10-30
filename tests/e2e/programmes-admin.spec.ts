import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql, subjectOf } from './support/db';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Écran des programmes', () => {
  test('la direction n’y a pas accès', async ({ page }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace/configuration/programmes');
    await expect(page.getByText('réservée au superadministrateur')).toBeVisible();
  });

  test('le référent pédagogique importe un brouillon, le relit puis le publie', async ({
    page,
  }, testInfo: TestInfo) => {
    const stamp = `${Date.now() % 1000000}-${testInfo.project.name}-${testInfo.retry}`;
    const username = `nouveau.programmes-${stamp}`.toLowerCase();
    await loginAs(page, username);
    await page.waitForLoadState('networkidle');
    await sql(
      `insert into memberships (user_id, organization_id, role)
       select u.id, o.id, 'referent-pedagogique' from users u, organizations o
        where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
      [subjectOf(username)],
    );

    await page.goto('/mon-espace/configuration/programmes');
    await page.waitForLoadState('networkidle');
    // Les programmes de démonstration publiés sont listés.
    await expect(page.getByTestId('curricula')).toContainText('Version 2026');

    const code = `E2E-${stamp}`.toUpperCase();
    const file = {
      curriculum: {
        code,
        // Branche sans programme de démonstration : la page publique des autres tests ne change pas.
        branch: 'formation-enseignants',
        title: `Programme d’essai ${stamp}`,
        description: 'Programme fictif des tests.',
      },
      version: {
        label: '2030',
        source: { title: 'Note fictive', issuer: 'Tests', isOfficial: false },
      },
      levels: [{ code: 'CP1', title: 'CP1' }],
      subjects: [{ code: 'MATH', title: 'Mathématiques' }],
      competencies: [
        { code: 'M1', title: 'Compter jusqu’à 10', subject: 'MATH', level: 'CP1' },
        { code: 'M2', title: 'Additionner', subject: 'MATH', level: 'CP1', prerequisites: ['M1'] },
      ],
    };

    await page.getByRole('button', { name: '+ Importer un programme' }).click();
    const dialog = page.getByRole('dialog');
    // Avancé : un fichier JSON faux, le détail de l'erreur reste dans la fenêtre.
    await dialog.getByText('Avancé : importer un fichier JSON').click();
    await dialog.getByLabel('Fichier JSON').setInputFiles({
      name: 'faux.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...file, subjects: [] })),
    });
    await dialog.getByRole('button', { name: 'Importer le fichier JSON' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Fichier invalide');

    // Le chemin simple : le formulaire du programme et un tableau Excel enregistré en CSV.
    await dialog.getByLabel('Titre du programme').fill(file.curriculum.title);
    await dialog.getByLabel('Code court').fill(code);
    await dialog.locator('select[name="branch"]').selectOption('formation-enseignants');
    await dialog.getByLabel('Description', { exact: true }).fill('Programme fictif des tests.');
    await dialog.getByLabel('Version', { exact: true }).fill('2030');
    await dialog.getByLabel('Texte de référence').fill('Note fictive');
    await dialog.getByLabel('Publié par').fill('Tests');
    await dialog.getByLabel('Tableau des compétences (.csv)').setInputFiles({
      name: 'programme.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Niveau;Matière;Code;Compétence;Description;Prérequis\n' +
          'CP1;Mathématiques;M1;Compter jusqu’à 10;;\n' +
          'CP1;Mathématiques;M2;Additionner;;M1\n',
      ),
    });
    await dialog.getByRole('button', { name: 'Importer le brouillon' }).click();
    await expect(page.getByText('Brouillon importé.')).toBeVisible();
    await expect(page.getByTestId('version-state')).toHaveText('Brouillon (non publié)');
    await expect(page.getByText('Prérequis : Compter jusqu’à 10')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.getByLabel('Date d’entrée en vigueur').fill('2031-09-01');
    await page.getByRole('button', { name: 'Publier la version 2030' }).click();
    await expect(page.getByText('Version publiée')).toBeVisible();
    await expect(page.getByTestId('version-state')).toContainText('À venir');
    await expect(page.getByRole('button', { name: /Publier/ })).toHaveCount(0);
  });
});
