import { mkdtemp, writeFile, copyFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultMigrationsDir, migrate } from '../../server/src/db/migrate.js';
import { seed } from '../../server/src/db/seed.js';
import { resetData, startApp } from './helpers.js';
import type { TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());

describe('migrations', () => {
  it('are idempotent', async () => {
    const r = await migrate(ctx.pool);
    expect(r.applied).toEqual([]);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it('refuse to run when an applied migration file was edited', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fl-mig-'));
    for (const f of await readdir(defaultMigrationsDir()))
      await copyFile(path.join(defaultMigrationsDir(), f), path.join(dir, f));
    await writeFile(path.join(dir, '001_init.sql'), '-- tampered\n', { flag: 'a' });
    await expect(migrate(ctx.pool, dir)).rejects.toThrow(/was modified after it was applied/);
  });
});

describe('demo seed', () => {
  const passwords = {
    admin: 'seed-admin-pass-1',
    technician: 'seed-tech-pass-1',
    viewer: 'seed-viewer-pass-1',
  };
  const counts = async () =>
    (
      await ctx.pool.query(
        `SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM customers)::int AS customers,
                (SELECT count(*) FROM service_requests)::int AS requests, (SELECT count(*) FROM tasks)::int AS tasks,
                (SELECT count(*) FROM activity_log)::int AS activity`,
      )
    ).rows[0];

  it('can run repeatedly without creating duplicates', async () => {
    await resetData(ctx.pool);
    await ctx.pool.query('DROP TABLE IF EXISTS seed_meta');
    const first = await seed(ctx.pool, passwords);
    const after1 = await counts();
    const second = await seed(ctx.pool, passwords);
    const after2 = await counts();
    expect(first.requestsInserted).toBe(150);
    expect(second.requestsInserted).toBe(0);
    expect(after2).toEqual(after1);
    expect(after1).toMatchObject({ users: 6, customers: 36, requests: 150 });
  });

  it('produces data that satisfies every constraint and status rule', async () => {
    const { rows } = await ctx.pool.query(
      `SELECT count(*)::int AS bad FROM service_requests r
        WHERE (r.status IN ('resolved', 'closed') AND EXISTS (SELECT 1 FROM tasks t WHERE t.request_id = r.id AND NOT t.is_done))`,
    );
    expect(rows[0].bad).toBe(0);
  });
});
