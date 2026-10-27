import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Identifiants fictifs : apps/api/src/db/demo-data.ts. Awa (CP1 A) est la fille vérifiée de
// Fatou ; le lien de Fatou vers Seydou (CP1 B, classe d'Aminata) est en attente.
const AWA = '40000000-0000-4000-8000-000000000001';
const KOUAME = '40000000-0000-4000-8000-000000000101';
const SEYDOU = '40000000-0000-4000-8000-000000000103';
const FATOU = '40000000-0000-4000-8000-000000000006';
const CP1_B = '30000000-0000-4000-8000-000000000002';
const UNKNOWN = '40000000-0000-4000-8000-0000000009ff';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const freshParent = (testInfo: TestInfo) =>
  `nouveau-parent.${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const main = (page: Page) => page.getByRole('main');

test.afterAll(async () => {
  await closeDb();
});

test.describe('Autorisations sur les données des mineurs (ticket 16)', () => {
  test('E2E-09 : un enseignant n’ouvre ni la classe ni l’élève d’une collègue, sans fuite', async ({
    page,
  }) => {
    await loginAs(page, 'enseignant.demo');
    // Son élève : accessible depuis sa classe.
    await page.getByRole('link', { name: 'CP1 A' }).click();
    await page.getByRole('link', { name: 'Awa (fictive)' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Awa (fictive)');
    await expect(page.getByTestId('learner-cohorts')).toContainText('CP1 A');

    // Classe et élève de la collègue : refusés.
    for (const path of [`/mon-espace/classes/${CP1_B}`, `/mon-espace/eleves/${SEYDOU}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
      for (const leak of ['CP1 B', 'Seydou', 'Aminata', '2026-2027']) {
        await expect(main(page)).not.toContainText(leak);
      }
    }
    // Même page pour un élève qui n'existe pas : rien ne permet de deviner les identifiants.
    const denied = await main(page).innerText();
    await page.goto(`/mon-espace/eleves/${UNKNOWN}`);
    expect(await main(page).innerText()).toBe(denied);
  });

  test('E2E-10 : un parent n’ouvre que la fiche de son enfant vérifié, et le refus est tracé', async ({
    page,
  }) => {
    const since = new Date();
    await loginAs(page, 'parent.demo');
    await page.getByRole('link', { name: 'Awa (fictive)' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Awa (fictive)');

    // Lien en attente vers Seydou, et fiche d'un autre élève : refusés.
    for (const id of [SEYDOU, KOUAME]) {
      await page.goto(`/mon-espace/eleves/${id}`);
      await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
      await expect(main(page)).not.toContainText('Seydou');
      await expect(main(page)).not.toContainText('Kouamé');
    }

    // Évènement d'audit : refus horodaté, avec trace, sans nom.
    const rows = await sql<{ decision: string; reason: string; trace_id: string | null }>(
      `select decision, reason, trace_id from audit_logs
        where actor_user_id = $1 and resource_type = 'learner' and resource_id = $2
          and occurred_at >= $3`,
      [FATOU, SEYDOU, since],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.decision).toBe('deny');
      expect(row.trace_id).toBeTruthy();
      expect(row.reason).not.toMatch(/Seydou|Fatou/);
    }
  });

  test('E2E-02 : pas de partage parental sans lien vérifié, et révocation immédiate', async ({
    page,
  }, testInfo) => {
    const username = freshParent(testInfo);
    await loginAs(page, username);
    await expect(page.getByRole('heading', { name: 'Bonjour, Parent fictif' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mes enfants' })).toHaveCount(0);
    const [parent] = await sql<{ id: string }>('select id from users where oidc_subject = $1', [
      subjectOf(username),
    ]);

    // Demande de lien en attente : toujours rien.
    await sql(
      `insert into guardian_links (guardian_user_id, learner_user_id, status) values ($1, $2, 'pending')`,
      [parent!.id, AWA],
    );
    await page.goto(`/mon-espace/eleves/${AWA}`);
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await page.goto('/mon-espace');
    await expect(page.getByRole('heading', { name: 'Mes enfants' })).toHaveCount(0);

    // Lien vérifié : l'enfant apparaît et sa fiche s'ouvre.
    await sql(
      `update guardian_links set status = 'verified', verified_at = now()
        where guardian_user_id = $1 and learner_user_id = $2`,
      [parent!.id, AWA],
    );
    await page.reload();
    await page.getByRole('link', { name: 'Awa (fictive)' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Awa (fictive)');

    // Lien révoqué : fermé dès la requête suivante.
    await sql(
      `update guardian_links set status = 'revoked', revoked_at = now()
        where guardian_user_id = $1 and learner_user_id = $2`,
      [parent!.id, AWA],
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await page.goto('/mon-espace');
    await expect(page.getByRole('heading', { name: 'Mes enfants' })).toHaveCount(0);
  });

  test('un élève ne lit que sa propre fiche', async ({ page }) => {
    await loginAs(page, 'apprenant.demo', `/mon-espace/eleves/${AWA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Awa (fictive)');
    await page.goto(`/mon-espace/eleves/${KOUAME}`);
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await expect(main(page)).not.toContainText('Kouamé');
  });

  test('sans connexion, la fiche élève demande de se connecter', async ({ page }) => {
    const response = await page.request.get(`/mon-espace/eleves/${AWA}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain('/auth/login');
  });

  test('E2E-16 : fiche élève sans violation axe WCAG A/AA', async ({ page }) => {
    await loginAs(page, 'parent.demo', `/mon-espace/eleves/${AWA}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Awa (fictive)');
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});
