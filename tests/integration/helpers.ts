import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config.js';
import type { Pool } from '../../server/src/db/pool.js';
import { createPool } from '../../server/src/db/pool.js';
import { hashPassword } from '../../server/src/modules/auth/passwords.js';
import { testDatabaseUrl } from './dbUrl.js';

/** Test-only credential for fixture users. Not used anywhere outside the test database. */
export const PASSWORD = 'fixture-password-1234';

export interface TestContext {
  app: FastifyInstance;
  pool: Pool;
  close: () => Promise<void>;
}

export async function startApp(overrides: Record<string, string> = {}): Promise<TestContext> {
  const config = loadConfig({
    DATABASE_URL: testDatabaseUrl(),
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_POOL_MAX: '12',
    LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
    APP_TIMEZONE: 'UTC',
    ...overrides,
  });
  const pool = createPool(config);
  const app = await buildApp(config, pool);
  await app.ready();
  return {
    app,
    pool,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export async function resetData(pool: Pool) {
  await pool.query(
    'TRUNCATE activity_log, request_notes, tasks, service_requests, customers, sessions, users RESTART IDENTITY CASCADE',
  );
}

let cachedHash: string | undefined;

export interface Fixtures {
  admin: string;
  tech1: string;
  tech2: string;
  viewer: string;
  customer: string;
}

export async function createFixtures(pool: Pool): Promise<Fixtures> {
  cachedHash ??= await hashPassword(PASSWORD);
  const user = async (email: string, name: string, role: string) =>
    (
      await pool.query<{ id: string }>(
        'INSERT INTO users (email, full_name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
        [email, name, role, cachedHash],
      )
    ).rows[0]!.id;
  const admin = await user('admin@test.example', 'Ada Admin', 'admin');
  const tech1 = await user('tech1@test.example', 'Tom Tech', 'technician');
  const tech2 = await user('tech2@test.example', 'Tia Tech', 'technician');
  const viewer = await user('viewer@test.example', 'Vic Viewer', 'viewer');
  const customer = (
    await pool.query<{ id: string }>(
      `INSERT INTO customers (name, contact_name, email, phone, address, city)
       VALUES ('Acme Test Site', 'Casey Contact', 'casey@acme.example', '+972-0-555-0000', '1 Test St', 'Haifa')
       RETURNING id`,
    )
  ).rows[0]!.id;
  return { admin, tech1, tech2, viewer, customer };
}

export interface Session {
  userId: string;
  cookie: string;
  csrf: string;
  call: (method: InjectOptions['method'], url: string, payload?: unknown) => Promise<LightMyRequestResponse>;
}

export async function login(app: FastifyInstance, email: string, userId = ''): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  const setCookie = res.cookies.find((c) => c.name === 'fl_session');
  if (!setCookie) throw new Error('no session cookie');
  const body = res.json<{ csrfToken: string; user: { id: string } }>();
  const cookie = `fl_session=${setCookie.value}`;
  return {
    userId: userId || body.user.id,
    cookie,
    csrf: body.csrfToken,
    call: (method, url, payload) =>
      app.inject({
        method,
        url,
        headers: { cookie, 'x-csrf-token': body.csrfToken },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      }),
  };
}

/** Creates a request through the API as `s` and returns its id and version. */
export async function createRequest(
  s: Session,
  customerId: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; version: number; ref: number }> {
  const res = await s.call('POST', '/api/requests', { customerId, title: 'Boiler pressure low', ...extra });
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.statusCode} ${res.body}`);
  const r = res.json<{ request: { id: string; version: number; ref: number } }>().request;
  return { id: r.id, version: r.version, ref: r.ref };
}
