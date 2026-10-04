import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixtures, createRequest, login, resetData, startApp } from './helpers.js';
import type { Fixtures, Session, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;
let admin: Session;
let tech1: Session;
let tech2: Session;
let viewer: Session;

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool);
  admin = await login(ctx.app, 'admin@test.example');
  tech1 = await login(ctx.app, 'tech1@test.example');
  tech2 = await login(ctx.app, 'tech2@test.example');
  viewer = await login(ctx.app, 'viewer@test.example');
});

async function assignedTo(techId: string) {
  const r = await createRequest(admin, fx.customer);
  const res = await admin.call('POST', `/api/requests/${r.id}/assign`, {
    expectedVersion: r.version,
    assigneeId: techId,
  });
  expect(res.statusCode).toBe(200);
  return { id: r.id, version: res.json().request.version as number };
}

describe('viewer role', () => {
  it('can read but every mutation is refused by the server', async () => {
    const r = await assignedTo(fx.tech1);
    expect((await viewer.call('GET', '/api/requests')).statusCode).toBe(200);
    expect((await viewer.call('GET', `/api/requests/${r.id}`)).statusCode).toBe(200);

    const attempts = await Promise.all([
      viewer.call('POST', '/api/customers', { name: 'Viewer Co', city: 'Haifa' }),
      viewer.call('POST', '/api/requests', { customerId: fx.customer, title: 'Should fail' }),
      viewer.call('PATCH', `/api/requests/${r.id}`, {
        expectedVersion: r.version,
        title: 'Changed by viewer',
      }),
      viewer.call('POST', `/api/requests/${r.id}/transition`, {
        expectedVersion: r.version,
        to: 'in_progress',
      }),
      viewer.call('POST', `/api/requests/${r.id}/notes`, { body: 'hello' }),
      viewer.call('POST', `/api/requests/${r.id}/tasks`, { title: 'New task' }),
    ]);
    expect(attempts.map((a) => a.statusCode)).toEqual([403, 403, 403, 403, 403, 403]);
    const after = await admin.call('GET', `/api/requests/${r.id}`);
    expect(after.json().request.version).toBe(r.version);
  });

  it('never receives customer contact details', async () => {
    const list = await viewer.call('GET', '/api/customers');
    const c = list.json().items[0];
    expect(c).toMatchObject({
      contactHidden: true,
      email: null,
      phone: null,
      contactName: null,
      address: null,
    });
    const one = await viewer.call('GET', `/api/customers/${fx.customer}`);
    expect(one.body).not.toContain('casey@acme.example');
  });

  it('sees no allowed actions on a request', async () => {
    const r = await assignedTo(fx.tech1);
    const res = await viewer.call('GET', `/api/requests/${r.id}`);
    expect(res.json().allowed).toEqual({
      edit: false,
      changePriority: false,
      assign: false,
      claim: false,
      unassign: false,
      transitions: [],
      manageTasks: false,
      addNote: false,
    });
  });
});

describe('technician role', () => {
  it('works only on requests assigned to them', async () => {
    const r = await assignedTo(fx.tech1);
    const other = await tech2.call('POST', `/api/requests/${r.id}/transition`, {
      expectedVersion: r.version,
      to: 'in_progress',
    });
    expect(other.statusCode).toBe(403);
    const own = await tech1.call('POST', `/api/requests/${r.id}/transition`, {
      expectedVersion: r.version,
      to: 'in_progress',
    });
    expect(own.statusCode).toBe(200);
  });

  it('cannot change priority, reassign, close or cancel', async () => {
    const r = await assignedTo(fx.tech1);
    expect(
      (await tech1.call('PATCH', `/api/requests/${r.id}`, { expectedVersion: r.version, priority: 'urgent' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await tech1.call('POST', `/api/requests/${r.id}/assign`, {
          expectedVersion: r.version,
          assigneeId: fx.tech2,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await tech1.call('POST', `/api/requests/${r.id}/transition`, {
          expectedVersion: r.version,
          to: 'cancelled',
          note: 'no',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('can claim an unassigned new request for themselves only', async () => {
    const r = await createRequest(admin, fx.customer);
    const forOther = await tech1.call('POST', `/api/requests/${r.id}/assign`, {
      expectedVersion: r.version,
      assigneeId: fx.tech2,
    });
    expect(forOther.statusCode).toBe(403);
    const claim = await tech1.call('POST', `/api/requests/${r.id}/assign`, {
      expectedVersion: r.version,
      assigneeId: fx.tech1,
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().request).toMatchObject({ status: 'assigned', assigneeId: fx.tech1 });
    const stolen = await tech2.call('POST', `/api/requests/${r.id}/assign`, {
      expectedVersion: claim.json().request.version,
      assigneeId: fx.tech2,
    });
    expect(stolen.statusCode).toBe(403);
  });

  it('can create customers but not edit them', async () => {
    const created = await tech1.call('POST', '/api/customers', {
      name: 'Field Created Ltd',
      city: 'Netanya',
    });
    expect(created.statusCode).toBe(201);
    const edit = await tech1.call('PUT', `/api/customers/${created.json().id}`, {
      expectedVersion: 1,
      name: 'Renamed Ltd',
      city: 'Netanya',
    });
    expect(edit.statusCode).toBe(403);
  });

  it('cannot read the full activity log', async () => {
    expect((await tech1.call('GET', '/api/activity')).statusCode).toBe(403);
    expect((await admin.call('GET', '/api/activity')).statusCode).toBe(200);
  });

  it('sees team members without email addresses', async () => {
    const res = await tech1.call('GET', '/api/users');
    expect(res.json().items.every((u: { email: string | null }) => u.email === null)).toBe(true);
    const asAdmin = await admin.call('GET', '/api/users');
    expect(asAdmin.json().items.some((u: { email: string | null }) => u.email === 'tech1@test.example')).toBe(
      true,
    );
  });
});

describe('assignment rules', () => {
  it('only assigns to active technicians', async () => {
    const r = await createRequest(admin, fx.customer);
    const toViewer = await admin.call('POST', `/api/requests/${r.id}/assign`, {
      expectedVersion: r.version,
      assigneeId: fx.viewer,
    });
    expect(toViewer.statusCode).toBe(422);
    expect(toViewer.json().error.code).toBe('INVALID_ASSIGNEE');
    await ctx.pool.query('UPDATE users SET is_active = false WHERE id = $1', [fx.tech2]);
    const toInactive = await admin.call('POST', `/api/requests/${r.id}/assign`, {
      expectedVersion: r.version,
      assigneeId: fx.tech2,
    });
    expect(toInactive.statusCode).toBe(422);
  });
});
