import { z } from 'zod';

/** Format d'erreur stable de l'API (cahier directeur §5.3). */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  trace_id: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  time: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;
