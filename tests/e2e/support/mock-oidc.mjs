// Fournisseur OIDC simulé pour les tests E2E : connexion automatique d'un compte fictif.
// Le compte est choisi par le paramètre standard `login_hint` (Awa par défaut).
// En développement, le vrai fournisseur est Keycloak.
import { OAuth2Server } from 'oauth2-mock-server';

// Mêmes identifiants que le jeu de démonstration de l'API (apps/api/src/db/demo-data.ts).
const USERS = {
  'apprenant.demo': {
    sub: '10000000-0000-4000-8000-000000000001',
    name: 'Awa',
    roles: ['apprenant'],
  },
  'enseignant.demo': {
    sub: '10000000-0000-4000-8000-000000000002',
    name: 'Koffi',
    roles: ['enseignant'],
  },
  'parent.demo': { sub: '10000000-0000-4000-8000-000000000006', name: 'Fatou', roles: ['parent'] },
  'referent.demo': {
    sub: '10000000-0000-4000-8000-000000000003',
    name: 'Mariam',
    roles: ['referent-pedagogique'],
  },
  'directeur.demo': {
    sub: '10000000-0000-4000-8000-000000000007',
    name: 'Bamba',
    roles: ['chef-etablissement'],
  },
};
const DEFAULT_USER = 'apprenant.demo';

const port = Number(process.env.MOCK_OIDC_PORT ?? 8090);
const server = new OAuth2Server();
await server.issuer.keys.generate('RS256');

const userByCode = new Map();
const userByRefreshToken = new Map();

server.service.on('beforeAuthorizeRedirect', ({ url }, req) => {
  const hint = req.query.login_hint;
  userByCode.set(url.searchParams.get('code'), hint in USERS ? hint : DEFAULT_USER);
});

function userFor(req) {
  req.lseUser ??=
    (req.body.grant_type === 'refresh_token'
      ? userByRefreshToken.get(req.body.refresh_token)
      : userByCode.get(req.body.code)) ?? DEFAULT_USER;
  return req.lseUser;
}

server.service.on('beforeTokenSigning', (token, req) => {
  const username = userFor(req);
  const user = USERS[username];
  const isIdToken = token.payload.aud === 'lenseignement-web';
  Object.assign(token.payload, {
    sub: user.sub,
    given_name: user.name,
    preferred_username: username,
  });
  if (!isIdToken) {
    Object.assign(token.payload, { aud: 'lenseignement-api', roles: user.roles });
  }
});

// Durée de vie inférieure à la marge de rafraîchissement du web (30 s) : chaque chargement de page
// authentifiée passe donc par le rafraîchissement du jeton, ce qui le teste en continu.
server.service.on('beforeResponse', (response, req) => {
  if (response.body.access_token) response.body.expires_in = 20;
  if (response.body.refresh_token)
    userByRefreshToken.set(response.body.refresh_token, userFor(req));
});

await server.start(port, 'localhost');
process.stdout.write(`OIDC simulé prêt sur ${server.issuer.url}\n`);
