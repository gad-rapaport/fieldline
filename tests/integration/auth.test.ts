import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixtures, login, PASSWORD, resetData, startApp } from './helpers.js';
import type { Fixtures, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool);
});

describe('authentication', () => {
  it('issues an HttpOnly, SameSite=Lax session cookie and a CSRF token', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ADMIN@test.example', password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === 'fl_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.path).toBe('/');
    expect(res.json().csrfToken).toEqual(expect.any(String));
    expect(res.json().user).toMatchObject({ id: fx.admin, role: 'admin' });
  });

  it('stores only a hash of the session token', async () => {
    const s = await login(ctx.app, 'admin@test.example');
    const token = s.cookie.split('=')[1]!;
    const { rows } = await ctx.pool.query('SELECT id_hash FROM sessions');
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0].id_hash).toString('base64url')).not.toBe(token);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@test.example', password: 'nope-nope-nope' },
    });
    const unknown = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@test.example', password: 'nope-nope-nope' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error).toEqual(unknown.json().error);
  });

  it('rejects inactive users', async () => {
    await ctx.pool.query("UPDATE users SET is_active = false WHERE email = 'tech1@test.example'");
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'tech1@test.example', password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it('reports a signed-out session probe as 200 with no user', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: null, csrfToken: null });
  });

  it('requires a session for API data', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/requests' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects state-changing requests without the CSRF token', async () => {
    const s = await login(ctx.app, 'admin@test.example');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { cookie: s.cookie },
      payload: { name: 'No Token Ltd', city: 'Haifa' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_REJECTED');
  });

  it('rejects a foreign Origin even with a valid token', async () => {
    const s = await login(ctx.app, 'admin@test.example');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, origin: 'https://evil.example' },
      payload: { name: 'Cross Site Ltd', city: 'Haifa' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('invalidates the session on logout', async () => {
    const s = await login(ctx.app, 'admin@test.example');
    expect((await s.call('POST', '/api/auth/logout')).statusCode).toBe(204);
    expect((await s.call('GET', '/api/requests')).statusCode).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const s = await login(ctx.app, 'admin@test.example');
    await ctx.pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect((await s.call('GET', '/api/requests')).statusCode).toBe(401);
  });

  it('records sign-ins in the activity log', async () => {
    await login(ctx.app, 'tech1@test.example');
    const { rows } = await ctx.pool.query("SELECT actor_id FROM activity_log WHERE action = 'session.login'");
    expect(rows.map((r) => r.actor_id)).toEqual([fx.tech1]);
  });
});

describe('login rate limit', () => {
  let limited: TestContext;
  beforeAll(async () => {
    limited = await startApp({ LOGIN_RATE_LIMIT_PER_MINUTE: '3' });
  });
  afterAll(() => limited.close());

  it('answers 429 after too many attempts for one account from one address', async () => {
    const attempt = () =>
      limited.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'admin@test.example', password: 'wrong-password-x' },
      });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await attempt()).statusCode);
    expect(codes).toEqual([401, 401, 401, 429]);
    const last = await attempt();
    expect(last.json().error.code).toBe('RATE_LIMITED');
  });
});

describe('security headers', () => {
  it('sends a restrictive CSP and no-store on API responses', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('hides internals in error responses', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": broken',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toMatch(/at .*\.(ts|js):\d+/);
  });
});
