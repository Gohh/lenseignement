import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

/** Valide l'environnement au démarrage : l'API refuse de démarrer avec une configuration invalide. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuration invalide : ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
