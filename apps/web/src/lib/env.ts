import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_INTERNAL_URL: z.string().url().default('http://localhost:4000/api/v1'),
  OIDC_ISSUER_URL: z.string().url().default('http://localhost:8080/realms/lenseignement'),
  OIDC_CLIENT_ID: z.string().min(1).default('lenseignement-web'),
  OIDC_CLIENT_SECRET: z.string().min(1).default('dev-only-web-secret-change-me'),
  SESSION_STORE: z.enum(['redis', 'memory']).default('redis'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

/** Variables d'environnement côté serveur uniquement : ne jamais importer depuis un composant client. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const env = ServerEnvSchema.parse(process.env);
  // `next start` force NODE_ENV=production : seul un service servi en local (tests E2E,
  // démonstration sur poste) peut s'affranchir de HTTPS et du stockage Redis.
  if (env.NODE_ENV === 'production' && !isLocalUrl(env.APP_URL)) {
    if (!env.APP_URL.startsWith('https://') || !isSecureOrLocal(env.OIDC_ISSUER_URL)) {
      throw new Error('APP_URL et OIDC_ISSUER_URL doivent être en HTTPS en production.');
    }
    if (env.SESSION_STORE === 'memory') {
      throw new Error('SESSION_STORE=memory est interdit en production.');
    }
  }
  cached = env;
  return env;
}

function isLocalUrl(value: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
}

function isSecureOrLocal(value: string): boolean {
  return value.startsWith('https://') || isLocalUrl(value);
}
