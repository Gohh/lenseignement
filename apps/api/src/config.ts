import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  OIDC_ISSUER_URL: z.string().url().default('http://localhost:8080/realms/lenseignement'),
  OIDC_AUDIENCE: z.string().min(1).default('lenseignement-api'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://lenseignement:change-me-dev-only@localhost:5432/lenseignement'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

/** Valide l'environnement au démarrage : l'API refuse de démarrer avec une configuration invalide. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuration invalide : ${z.prettifyError(result.error)}`);
  }
  const config = result.data;
  if (config.NODE_ENV === 'production' && !config.OIDC_ISSUER_URL.startsWith('https://')) {
    throw new Error('Configuration invalide : OIDC_ISSUER_URL doit être en HTTPS en production.');
  }
  return config;
}
