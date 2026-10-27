// Fournisseur OIDC simulé pour les tests E2E : connexion automatique d'une apprenante fictive.
// En développement, le vrai fournisseur est Keycloak (docker-compose).
import { OAuth2Server } from 'oauth2-mock-server';

const port = Number(process.env.MOCK_OIDC_PORT ?? 8090);
const server = new OAuth2Server();
await server.issuer.keys.generate('RS256');

server.service.on('beforeTokenSigning', (token) => {
  const isIdToken = token.payload.aud === 'lenseignement-web';
  Object.assign(token.payload, {
    sub: 'awa-demo',
    given_name: 'Awa',
    preferred_username: 'apprenant.demo',
  });
  if (!isIdToken) {
    Object.assign(token.payload, { aud: 'lenseignement-api', roles: ['apprenant'] });
  }
});

// Durée de vie inférieure à la marge de rafraîchissement du web (30 s) : chaque chargement de page
// authentifiée passe donc par le rafraîchissement du jeton, ce qui le teste en continu.
server.service.on('beforeResponse', (response) => {
  if (response.body.access_token) response.body.expires_in = 20;
});

await server.start(port, 'localhost');
process.stdout.write(`OIDC simulé prêt sur ${server.issuer.url}\n`);
