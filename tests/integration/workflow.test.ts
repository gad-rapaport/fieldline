import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as service from '../../server/src/modules/requests/service.js';
import { createFixtures, createRequest, login, resetData, startApp } from './helpers.js';
import type { Fixtures, Session, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;
let admin: Session;
let tech: Session;

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool);
  admin = await login(ctx.app, 'admin@test.example');
  tech = await login(ctx.app, 'tech1@test.example');
});

type Bundle = {
  request: { id: string; status: string; version: number; resolvedAt: string | null };
  tasks: { id: string; version: number; isDone: boolean }[];
  notes: { kind: string; body: string }[];
  allowed: { transitions: string[] };
};

async function move(s: Session, id: string, version: number, to: string, note?: string) {
  return s.call('POST', `/api/requests/${id}/transition`, { expectedVersion: version, to, note });
}

describe('service request lifecycle', () => {
  it('runs new → assigned → in progress → resolved → closed with an audit trail', async () => {
    const r = await createRequest(admin, fx.customer, {
      tasks: ['Inspect valve', 'Replace seal'],
      priority: 'high',
    });
    expect(r.ref).toBeGreaterThanOrEqual(1001);

    let res = await admin.call('POST', `/api/requests/${r.id}/assign`, {
      expectedVersion: r.version,
      assigneeId: fx.tech1,
    });
    let b = res.json<Bundle>();
    expect(b.request.status).toBe('assigned');

    res = await move(tech, r.id, b.request.version, 'in_progress');
    b = res.json<Bundle>();
    expect(b.request.status).toBe('in_progress');
    expect(b.allowed.transitions).toEqual(['on_hold', 'resolved']);

    // Business rule: open tasks block resolution.
    res = await move(tech, r.id, b.request.version, 'resolved', 'Fixed');
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'TASKS_OPEN', details: { openTasks: 2 } });

    for (const t of b.tasks) {
      const done = await tech.call('PATCH', `/api/tasks/${t.id}`, {
        expectedVersion: t.version,
        isDone: true,
      });
      expect(done.statusCode).toBe(200);
    }

    // Business rule: resolving needs a resolution note.
    res = await move(tech, r.id, b.request.version, 'resolved');
    expect(res.json().error.code).toBe('NOTE_REQUIRED');

    res = await move(tech, r.id, b.request.version, 'resolved', 'Replaced worn seal, pressure stable.');
    b = res.json<Bundle>();
    expect(b.request.status).toBe('resolved');
    expect(b.request.resolvedAt).not.toBeNull();
    expect(b.notes).toEqual([expect.objectContaining({ kind: 'resolution' })]);

    // Closing is an admin decision.
    expect((await move(tech, r.id, b.request.version, 'closed')).statusCode).toBe(403);
    res = await move(admin, r.id, b.request.version, 'closed');
    expect(res.json<Bundle>().request.status).toBe('closed');

    const log = await admin.call('GET', `/api/requests/${r.id}/activity`);
    const actions = log
      .json<{ items: { action: string }[] }>()
      .items.map((a) => a.action)
      .reverse();
    expect(actions).toEqual([
      'request.created',
      'request.assigned',
      'request.status_changed',
      'task.completed',
      'task.completed',
      'request.status_changed',
      'request.status_changed',
    ]);
  });

  it('rejects illegal transitions with a clear message', async () => {
    const r = await createRequest(admin, fx.customer);
    const res = await move(admin, r.id, r.version, 'resolved', 'skip ahead');
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: 'ILLEGAL_TRANSITION',
      message: 'A request cannot move from New to Resolved.',
    });
    const viaTransition = await move(admin, r.id, r.version, 'assigned');
    expect(viaTransition.json().error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('locks a closed request against edits, tasks and notes', async () => {
    const r = await createRequest(admin, fx.customer);
    const cancelled = await move(admin, r.id, r.version, 'cancelled', 'Duplicate');
    const v = cancelled.json<Bundle>().request.version;
    expect(
      (await admin.call('PATCH', `/api/requests/${r.id}`, { expectedVersion: v, title: 'Too late' })).json()
        .error.code,
    ).toBe('REQUEST_LOCKED');
    expect(
      (await admin.call('POST', `/api/requests/${r.id}/tasks`, { title: 'Too late' })).json().error.code,
    ).toBe('REQUEST_LOCKED');
    expect(
      (await admin.call('POST', `/api/requests/${r.id}/notes`, { body: 'Too late' })).json().error.code,
    ).toBe('REQUEST_LOCKED');
  });

  it('clears the resolution timestamp when a resolved request is reopened', async () => {
    const r = await createRequest(admin, fx.customer);
    let b = (
      await admin.call('POST', `/api/requests/${r.id}/assign`, {
        expectedVersion: r.version,
        assigneeId: fx.tech1,
      })
    ).json<Bundle>();
    b = (await move(tech, r.id, b.request.version, 'in_progress')).json<Bundle>();
    b = (await move(tech, r.id, b.request.version, 'resolved', 'Done')).json<Bundle>();
    b = (await move(tech, r.id, b.request.version, 'in_progress')).json<Bundle>();
    expect(b.request).toMatchObject({ status: 'in_progress', resolvedAt: null });
  });

  it('validates input on the server and reports field errors', async () => {
    const res = await admin.call('POST', '/api/requests', {
      customerId: 'not-a-uuid',
      title: 'x',
      priority: 'whenever',
    });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().error.details.fields).sort()).toEqual(['customerId', 'priority', 'title']);
    const unknownField = await admin.call('PATCH', `/api/requests/${fx.customer}`, {
      expectedVersion: 1,
      status: 'closed',
    });
    expect(unknownField.statusCode).toBe(400);
  });

  it('rejects a duplicate customer name in the same city', async () => {
    const res = await admin.call('POST', '/api/customers', { name: 'ACME TEST SITE', city: 'haifa' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DUPLICATE');
  });
});

describe('transactions', () => {
  it('rolls back the whole request when one of its tasks fails a database constraint', async () => {
    const actor = { id: fx.admin, role: 'admin' as const };
    // Bypasses HTTP validation on purpose: a 1-character task violates the tasks CHECK constraint.
    await expect(
      service.createRequest(ctx.pool, actor, {
        customerId: fx.customer,
        title: 'Atomic create',
        description: '',
        priority: 'normal',
        dueAt: null,
        tasks: ['Valid task', 'x'],
      }),
    ).rejects.toThrow();
    const counts = await ctx.pool.query(
      `SELECT (SELECT count(*) FROM service_requests)::int AS requests,
              (SELECT count(*) FROM tasks)::int AS tasks,
              (SELECT count(*) FROM activity_log WHERE action = 'request.created')::int AS logs`,
    );
    expect(counts.rows[0]).toEqual({ requests: 0, tasks: 0, logs: 0 });
  });

  it('keeps database invariants even if the service layer is bypassed', async () => {
    const r = await createRequest(admin, fx.customer);
    await expect(
      ctx.pool.query("UPDATE service_requests SET status = 'in_progress' WHERE id = $1", [r.id]),
    ).rejects.toThrow(/service_requests_assignee_matches_status/);
  });
});
