import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp } from './helpers.js';
import type { TestContext } from './helpers.js';

// Production mode serves the built web app from the same process. This configuration once changed which error
// handler applied to API routes, so it is tested separately from the API-only setup used elsewhere.
let ctx: TestContext;

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fl-web-'));
  await mkdir(path.join(dir, 'assets'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>Fieldline test shell</title>');
  await writeFile(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  ctx = await startApp({ WEB_DIST: dir });
});
afterAll(() => ctx.close());

describe('static hosting', () => {
  it('falls back to index.html for client-side routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/requests/some-id' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Fieldline test shell');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves hashed assets as immutable', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps the API error format for API routes', async () => {
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    const unauth = await ctx.app.inject({ method: 'GET', url: '/api/requests' });
    expect(unauth.json()).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
      requestId: expect.any(String),
    });
  });
});
