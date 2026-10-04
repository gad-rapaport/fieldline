import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from './pool.js';
import { withTransaction } from './pool.js';
import { hashPassword } from '../modules/auth/passwords.js';
import type { Priority, Status } from '../domain/requestStatus.js';

/**
 * Deterministic synthetic demo data. Running the seed twice inserts nothing new: every row has a stable id
 * derived from a name, and inserts use ON CONFLICT DO NOTHING. Dates are relative to the moment the
 * database was first seeded, so the dashboard always has recent activity after a demo reset.
 *
 * All people, companies, emails (reserved .test / .example domains) and phone numbers are fictional.
 */

export interface SeedPasswords {
  admin: string;
  technician: string;
  viewer: string;
}

export interface SeedSummary {
  users: number;
  customers: number;
  requestsInserted: number;
}

export function stableId(name: string): string {
  const b = createHash('sha256').update(`fieldline:${name}`).digest();
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5 layout
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Small seeded PRNG (mulberry32) so the same data comes out on every machine. */
function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
  };
}

const USERS = [
  { key: 'admin', email: 'admin@fieldline.test', fullName: 'Avery Morgan', role: 'admin' },
  { key: 'tech-1', email: 'noa@fieldline.test', fullName: 'Noa Peretz', role: 'technician' },
  { key: 'tech-2', email: 'sam@fieldline.test', fullName: 'Sam Okafor', role: 'technician' },
  { key: 'tech-3', email: 'lior@fieldline.test', fullName: 'Lior Ben-Ami', role: 'technician' },
  { key: 'tech-4', email: 'rina@fieldline.test', fullName: 'Rina Haddad', role: 'technician' },
  { key: 'viewer', email: 'viewer@fieldline.test', fullName: 'Demo Viewer', role: 'viewer' },
] as const;

const PLACES = [
  'Harbor',
  'Cedar',
  'Northgate',
  'Olive Grove',
  'Summit',
  'Bluewater',
  'Granite',
  'Riverside',
  'Lighthouse',
  'Orchard',
  'Copperline',
  'Meadow',
];
const BUSINESSES = [
  'Bakery',
  'Dental Clinic',
  'Print Shop',
  'Fitness Studio',
  'Hostel',
  'Pharmacy',
  'Logistics',
  'Coworking',
  'Veterinary Clinic',
];
const CITIES = ['Haifa', 'Tel Aviv-Yafo', 'Jerusalem', "Be'er Sheva", 'Netanya', 'Rishon LeZion'];
const STREETS = ['Herzl St', 'HaNamal St', 'Jaffa Rd', 'Ben Yehuda St', 'HaAtzmaut Blvd', 'Weizmann St'];
const CONTACTS = [
  'Tal Mizrahi',
  'Yael Friedman',
  'Omer Katz',
  'Dana Shapiro',
  'Eitan Levi',
  'Shira Golan',
  'Ido Weiss',
  'Maya Adler',
];

const ISSUES: { title: string; tasks: string[]; priority: Priority }[] = [
  {
    title: 'Walk-in freezer not holding temperature',
    priority: 'urgent',
    tasks: ['Check compressor current draw', 'Inspect door gasket', 'Log temperature for 2 hours'],
  },
  {
    title: 'Replace tripped RCD in back office',
    priority: 'high',
    tasks: ['Isolate circuit', 'Replace RCD', 'Test trip time'],
  },
  {
    title: 'Shared printer unreachable on network',
    priority: 'normal',
    tasks: ['Check DHCP lease', 'Reassign static IP', 'Test print from two workstations'],
  },
  {
    title: 'Quarterly HVAC filter service',
    priority: 'low',
    tasks: ['Replace filters', 'Clean condensate tray', 'Record pressure readings'],
  },
  {
    title: 'Door access controller offline',
    priority: 'high',
    tasks: ['Check controller power supply', 'Re-sync badge list'],
  },
  {
    title: 'Leak under staff kitchen sink',
    priority: 'normal',
    tasks: ['Replace trap seal', 'Dry and inspect cabinet base'],
  },
  {
    title: 'Emergency lighting failed monthly test',
    priority: 'high',
    tasks: ['Replace battery packs', 'Run 3-hour duration test', 'Update logbook'],
  },
  {
    title: 'Card terminal fails to boot',
    priority: 'urgent',
    tasks: ['Swap power adapter', 'Factory reset terminal'],
  },
  {
    title: 'Wi-Fi drops in meeting room',
    priority: 'normal',
    tasks: ['Survey signal strength', 'Move access point', 'Verify roaming'],
  },
  {
    title: 'Water heater pressure valve dripping',
    priority: 'normal',
    tasks: ['Replace pressure relief valve', 'Check expansion vessel'],
  },
  {
    title: 'Install additional power outlets at front desk',
    priority: 'low',
    tasks: ['Confirm layout with customer', 'Run new circuit', 'Label breaker'],
  },
  {
    title: 'Security camera recording gaps',
    priority: 'high',
    tasks: ['Check NVR disk health', 'Review retention settings'],
  },
];

const RESOLUTIONS = [
  'Root cause found and fixed; customer confirmed normal operation.',
  'Faulty part replaced and tested under load.',
  'Configuration corrected; monitored for 30 minutes without recurrence.',
];
const HOLDS = ['Waiting for replacement part from supplier.', 'Customer asked to reschedule the visit.'];
const CANCELLATIONS = ['Duplicate of an existing request.', 'Customer resolved the issue internally.'];
const COMMENTS = [
  'Called the customer to confirm access hours.',
  'Parts list sent for approval.',
  'Site visit booked for tomorrow morning.',
];

const HOUR = 3_600_000;
const DUE_HOURS: Record<Priority, number> = { urgent: 8, high: 48, normal: 120, low: 240 };

async function seedUsers(tx: PoolClient, passwords: SeedPasswords): Promise<Map<string, string>> {
  const hashes = {
    admin: await hashPassword(passwords.admin),
    technician: await hashPassword(passwords.technician),
    viewer: await hashPassword(passwords.viewer),
  };
  const ids = new Map<string, string>();
  for (const u of USERS) {
    const id = stableId(`user:${u.key}`);
    // Password hashes are refreshed so a regenerated .env always matches; nothing else is overwritten.
    await tx.query(
      `INSERT INTO users (id, email, full_name, role, password_hash) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [id, u.email, u.fullName, u.role, hashes[u.role]],
    );
    ids.set(u.key, id);
  }
  return ids;
}

async function seedCustomers(tx: PoolClient, rnd: ReturnType<typeof prng>): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < 36; i++) {
    const name = `${PLACES[i % PLACES.length]} ${BUSINESSES[(i * 5) % BUSINESSES.length]}`;
    const city = CITIES[i % CITIES.length]!;
    const id = stableId(`customer:${name}:${city}`);
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
    await tx.query(
      `INSERT INTO customers (id, name, contact_name, email, phone, address, city, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - make_interval(days => $9), now() - make_interval(days => $9))
       ON CONFLICT DO NOTHING`,
      [
        id,
        name,
        rnd.pick(CONTACTS),
        `service@${slug}.example`,
        `+972-0-555-${String(100 + i).padStart(4, '0')}`,
        `${rnd.int(2, 140)} ${rnd.pick(STREETS)}`,
        city,
        rnd.chance(0.3) ? 'Access through the rear loading entrance before 10:00.' : '',
        60 + i,
      ],
    );
    ids.push(id);
  }
  return ids;
}

interface PlannedRequest {
  key: string;
  customerId: string;
  issue: (typeof ISSUES)[number];
  createdAt: Date;
  status: Status;
  assigneeKey: string | null;
  resolvedAt: Date | null;
  dueAt: Date;
  doneTasks: number;
}

function planRequests(rnd: ReturnType<typeof prng>, customers: string[], now: number): PlannedRequest[] {
  const techs = USERS.filter((u) => u.role === 'technician').map((u) => u.key);
  const planned: PlannedRequest[] = [];
  for (let i = 0; i < 150; i++) {
    const issue = rnd.pick(ISSUES);
    const ageHours = Math.pow(rnd.next(), 1.6) * 45 * 24; // skewed towards recent requests
    const createdAt = new Date(now - ageHours * HOUR);
    const priority = rnd.chance(0.2)
      ? rnd.pick(['low', 'normal', 'high', 'urgent'] as const)
      : issue.priority;
    const dueAt = new Date(createdAt.getTime() + DUE_HOURS[priority] * HOUR);
    const roll = rnd.next();
    let status: Status;
    if (ageHours < 6) status = roll < 0.6 ? 'new' : 'assigned';
    else if (ageHours < 72)
      status =
        roll < 0.12
          ? 'new'
          : roll < 0.3
            ? 'assigned'
            : roll < 0.6
              ? 'in_progress'
              : roll < 0.68
                ? 'on_hold'
                : 'resolved';
    else
      status =
        roll < 0.05
          ? 'on_hold'
          : roll < 0.1
            ? 'in_progress'
            : roll < 0.16
              ? 'cancelled'
              : roll < 0.4
                ? 'resolved'
                : 'closed';
    let resolvedAt: Date | null = null;
    if (status === 'resolved' || status === 'closed') {
      resolvedAt = new Date(
        createdAt.getTime() + rnd.int(2, Math.max(3, Math.min(ageHours - 1, 120))) * HOUR,
      );
    }
    const tasks = issue.tasks.length;
    const doneTasks =
      status === 'resolved' || status === 'closed'
        ? tasks
        : status === 'in_progress' || status === 'on_hold'
          ? rnd.int(0, tasks - 1)
          : 0;
    planned.push({
      key: `request:${i}`,
      customerId: rnd.pick(customers),
      issue: { ...issue, priority },
      createdAt,
      status,
      assigneeKey: status === 'new' || (status === 'cancelled' && rnd.chance(0.5)) ? null : rnd.pick(techs),
      resolvedAt,
      dueAt,
      doneTasks,
    });
  }
  // Insert in chronological order so the human-readable SR numbers grow with time.
  return planned.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function insertPlanned(
  tx: PoolClient,
  p: PlannedRequest,
  users: Map<string, string>,
  rnd: ReturnType<typeof prng>,
) {
  const id = stableId(p.key);
  const adminId = users.get('admin')!;
  const assigneeId = p.assigneeKey ? users.get(p.assigneeKey)! : null;
  const creator = rnd.chance(0.6) ? adminId : (assigneeId ?? adminId);
  const lastChange = p.resolvedAt ?? new Date(p.createdAt.getTime() + HOUR);
  const res = await tx.query<{ ref: number }>(
    `INSERT INTO service_requests
       (id, customer_id, title, description, priority, status, assignee_id, due_at, created_by, created_at, updated_at, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, LEAST($11::timestamptz, now()), $12)
     ON CONFLICT (id) DO NOTHING RETURNING ref`,
    [
      id,
      p.customerId,
      p.issue.title,
      'Reported by phone. Customer reports the problem started this week and is affecting daily operations.',
      p.issue.priority,
      p.status,
      assigneeId,
      p.dueAt,
      creator,
      p.createdAt,
      lastChange,
      p.resolvedAt,
    ],
  );
  const ref = res.rows[0]?.ref;
  if (ref === undefined) return false; // already seeded

  for (const [i, title] of p.issue.tasks.entries()) {
    const done = i < p.doneTasks;
    await tx.query(
      `INSERT INTO tasks (id, request_id, title, assignee_id, is_done, done_at, position, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [
        stableId(`${p.key}:task:${i}`),
        id,
        title,
        assigneeId,
        done,
        done ? (p.resolvedAt ?? lastChange) : null,
        i + 1,
        p.createdAt,
      ],
    );
  }

  const log = async (action: string, summary: string, at: Date, actor: string | null, details: object = {}) =>
    tx.query(
      `INSERT INTO activity_log (actor_id, entity_type, entity_id, action, summary, details, created_at)
       VALUES ($1, 'request', $2, $3, $4, $5, $6)`,
      [actor, id, action, summary, details, at],
    );
  const note = async (kind: string, body: string, at: Date, author: string) =>
    tx.query(
      `INSERT INTO request_notes (id, request_id, author_id, kind, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [stableId(`${p.key}:note:${kind}`), id, author, kind, body, at],
    );

  await log('request.created', `Opened SR-${ref}`, p.createdAt, creator, { priority: p.issue.priority });
  const assignedAt = new Date(p.createdAt.getTime() + 0.5 * HOUR);
  if (assigneeId)
    await log('request.assigned', 'Assigned to technician', assignedAt, adminId, { to: assigneeId });
  const startedAt = new Date(p.createdAt.getTime() + HOUR);
  if (['in_progress', 'on_hold', 'resolved', 'closed'].includes(p.status) && assigneeId) {
    await log('request.status_changed', 'Status Assigned → In progress', startedAt, assigneeId, {
      from: 'assigned',
      to: 'in_progress',
    });
    if (rnd.chance(0.4)) await note('comment', rnd.pick(COMMENTS), startedAt, assigneeId);
  }
  if (p.status === 'on_hold' && assigneeId) {
    await note('hold', rnd.pick(HOLDS), startedAt, assigneeId);
    await log('request.status_changed', 'Status In progress → On hold', startedAt, assigneeId, {
      from: 'in_progress',
      to: 'on_hold',
    });
  }
  if (p.resolvedAt && assigneeId) {
    await note('resolution', rnd.pick(RESOLUTIONS), p.resolvedAt, assigneeId);
    await log('request.status_changed', 'Status In progress → Resolved', p.resolvedAt, assigneeId, {
      from: 'in_progress',
      to: 'resolved',
    });
  }
  if (p.status === 'closed' && p.resolvedAt) {
    await log(
      'request.status_changed',
      'Status Resolved → Closed',
      new Date(p.resolvedAt.getTime() + HOUR),
      adminId,
      { from: 'resolved', to: 'closed' },
    );
  }
  if (p.status === 'cancelled') {
    await note('cancellation', rnd.pick(CANCELLATIONS), lastChange, adminId);
    await log('request.status_changed', 'Request cancelled', lastChange, adminId, { to: 'cancelled' });
  }
  return true;
}

export async function seed(pool: Pool, passwords: SeedPasswords): Promise<SeedSummary> {
  return withTransaction(pool, async (tx) => {
    // Anchor "now" to the first seed so re-running later does not shift the plan relative to existing rows.
    await tx.query(
      `CREATE TABLE IF NOT EXISTS seed_meta (key text PRIMARY KEY, anchored_at timestamptz NOT NULL)`,
    );
    const anchor = await tx.query<{ anchored_at: Date }>(
      `INSERT INTO seed_meta (key, anchored_at) VALUES ('demo', now())
       ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key RETURNING anchored_at`,
    );
    const now = anchor.rows[0]!.anchored_at.getTime();
    const rnd = prng(20261004);
    const users = await seedUsers(tx, passwords);
    const customers = await seedCustomers(tx, rnd);
    let inserted = 0;
    for (const p of planRequests(rnd, customers, now)) {
      if (await insertPlanned(tx, p, users, rnd)) inserted++;
    }
    return { users: users.size, customers: customers.length, requestsInserted: inserted };
  });
}
