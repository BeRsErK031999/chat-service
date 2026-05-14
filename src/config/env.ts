import 'dotenv/config';

import { z } from 'zod';

export const authModeSchema = z.enum(['integrated', 'standalone']);

export type AuthMode = z.infer<typeof authModeSchema>;

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  AUTH_MODE: authModeSchema.default('standalone'),
  CHAT_CORS_ALLOWED_ORIGINS: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv): Env => envSchema.parse(source);

export const env = loadEnv(process.env);
