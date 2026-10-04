import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3101),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  COOKIE_SECURE: bool.default(false),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MIGRATE_ON_START: bool.default(false),
  WEB_DIST: z.string().optional(),
  APP_TIMEZONE: z.string().default('Asia/Jerusalem'),
  /** Extra origin accepted on state-changing requests, e.g. the Vite dev server. */
  DEV_ORIGIN: z.string().url().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  if (!isValidTimeZone(parsed.data.APP_TIMEZONE)) {
    throw new Error(`Invalid configuration: APP_TIMEZONE "${parsed.data.APP_TIMEZONE}" is not an IANA zone`);
  }
  return parsed.data;
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
