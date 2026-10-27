import { expect, test } from '@playwright/test';

// Connexion via le fournisseur OIDC simulé (tests/e2e/support/mock-oidc.mjs).
test.describe('Connexion OIDC (ticket 5)', () => {
  test('« Mon espace » exige une connexion puis affiche l’identité vérifiée par l’API', async ({
    page,
  }) => {
    const authorize = page.waitForRequest((req) =>
      req.url().startsWith('http://localhost:8090/authorize'),
    );
    await page.goto('/');
    await page.getByRole('link', { name: 'Mon espace' }).click();

    const authorizeUrl = new URL((await authorize).url());
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
    expect(authorizeUrl.searchParams.get('nonce')).toBeTruthy();

    await expect(page).toHaveURL(/\/mon-espace$/);
    await expect(page.getByRole('heading', { name: 'Bonjour, Awa' })).toBeVisible();
    await expect(page.getByText('Apprenant', { exact: true })).toBeVisible();
    await expect(page.getByTestId('api-status')).toHaveText('Compte reconnu par le service.');
  });

  test('le jeton d’accès expiré est renouvelé sans nouvelle connexion', async ({ page }) => {
    await page.goto('/mon-espace');
    await expect(page.getByRole('heading', { name: 'Bonjour, Awa' })).toBeVisible();

    const reauthentications: string[] = [];
    page.on('request', (req) => {
      if (req.url().startsWith('http://localhost:8090/authorize'))
        reauthentications.push(req.url());
    });
    await page.reload();
    await page.reload();
    await expect(page.getByTestId('api-status')).toHaveText('Compte reconnu par le service.');
    expect(reauthentications).toEqual([]);
  });

  test('le navigateur ne reçoit qu’un identifiant de session opaque et protégé', async ({
    page,
    context,
  }) => {
    await page.goto('/mon-espace');
    await expect(page.getByRole('heading', { name: 'Bonjour, Awa' })).toBeVisible();

    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'lse_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    expect(session?.value).not.toContain('.'); // pas un JWT
    expect(cookies.find((c) => c.name === 'lse_login_state')).toBeUndefined();

    const html = await page.content();
    expect(html).not.toMatch(/eyJ[\w-]+\.eyJ[\w-]+/); // aucun jeton dans la page
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(storage).toBe('{}');
  });

  test('la déconnexion détruit la session côté serveur', async ({ page, context }) => {
    await page.goto('/mon-espace');
    await expect(page.getByRole('heading', { name: 'Bonjour, Awa' })).toBeVisible();
    const oldSession = (await context.cookies()).find((c) => c.name === 'lse_session')!.value;

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
    expect((await context.cookies()).find((c) => c.name === 'lse_session')).toBeUndefined();

    // Rejouer l'ancien identifiant ne rouvre pas la session : retour au fournisseur d'identité.
    await context.addCookies([
      { name: 'lse_session', value: oldSession, domain: 'localhost', path: '/', httpOnly: true },
    ]);
    const authorize = page.waitForRequest((req) =>
      req.url().startsWith('http://localhost:8090/authorize'),
    );
    await page.goto('/mon-espace');
    await authorize;
  });

  test('un retour de connexion falsifié est refusé', async ({ page }) => {
    await page.goto('/auth/callback?code=forge&state=forge');
    await expect(page).toHaveURL(/\/connexion\/erreur$/);
    await expect(page.getByRole('heading', { name: 'Connexion impossible' })).toBeVisible();
  });

  test('aucune redirection ouverte après connexion', async ({ page }) => {
    await page.goto('/auth/login?returnTo=//exemple-malveillant.invalid');
    await expect(page).toHaveURL('http://localhost:3000/mon-espace');
  });

  test('la déconnexion depuis une autre origine est refusée', async ({ request }) => {
    const res = await request.post('/auth/logout', {
      headers: { origin: 'https://exemple-malveillant.invalid' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
  });
});
