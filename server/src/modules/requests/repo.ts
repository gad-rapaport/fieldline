import type { Db } from '../../db/pool.js';
import type { Priority, Status } from '../../domain/requestStatus.js';
import { escapeLike } from '../customers/repo.js';

export interface RequestListRow {
  id: string;
  ref: number;
  title: string;
  status: Status;
  priority: Priority;
  customerId: string;
  customerName: string;
  customerCity: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  version: number;
  overdue: boolean;
  openTasks: number;
  totalTasks: number;
}

export interface RequestDetailRow extends RequestListRow {
  description: string;
  createdById: string;
  createdByName: string;
}

const OPEN = `('new', 'assigned', 'in_progress', 'on_hold')`;

const COLUMNS = `
  r.id, r.ref, r.title, r.status, r.priority, r.customer_id AS "customerId", c.name AS "customerName",
  c.city AS "customerCity", r.assignee_id AS "assigneeId", a.full_name AS "assigneeName", r.due_at AS "dueAt",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt", r.resolved_at AS "resolvedAt", r.version,
  (r.due_at IS NOT NULL AND r.due_at < now() AND r.status IN ${OPEN}) AS overdue,
  coalesce(t.open_tasks, 0)::int AS "openTasks", coalesce(t.total_tasks, 0)::int AS "totalTasks"`;

const JOINS = `
  JOIN customers c ON c.id = r.customer_id
  LEFT JOIN users a ON a.id = r.assignee_id
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE NOT is_done) AS open_tasks, count(*) AS total_tasks
      FROM tasks WHERE request_id = r.id
  ) t ON true`;

export const REQUEST_SORTS = {
  created: 'r.created_at ASC, r.ref',
  '-created': 'r.created_at DESC, r.ref DESC',
  updated: 'r.updated_at ASC, r.ref',
  '-updated': 'r.updated_at DESC, r.ref DESC',
  due: 'r.due_at ASC NULLS LAST, r.ref',
  '-due': 'r.due_at DESC NULLS LAST, r.ref',
  priority: 'r.priority ASC, r.created_at DESC',
  '-priority': 'r.priority DESC, r.created_at DESC',
  ref: 'r.ref ASC',
  '-ref': 'r.ref DESC',
  customer: 'lower(c.name) ASC, r.ref DESC',
  '-customer': 'lower(c.name) DESC, r.ref DESC',
} as const;
export type RequestSort = keyof typeof REQUEST_SORTS;

export interface RequestFilter {
  q?: string | undefined;
  status?: Status[] | undefined;
  priority?: Priority[] | undefined;
  assigneeId?: string | undefined;
  unassigned?: boolean | undefined;
  customerId?: string | undefined;
  overdue?: boolean | undefined;
  sort: RequestSort;
  page: number;
  pageSize: number;
}

export function buildRequestWhere(f: RequestFilter): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (f.q) {
    const refMatch = /^(?:SR-?)?(\d{1,9})$/i.exec(f.q);
    const like = add(`%${escapeLike(f.q)}%`);
    const refClause = refMatch ? ` OR r.ref = ${add(Number(refMatch[1]))}` : '';
    where.push(`(r.title ILIKE ${like} OR c.name ILIKE ${like}${refClause})`);
  }
  if (f.status?.length) where.push(`r.status = ANY(${add(f.status)}::request_status[])`);
  if (f.priority?.length) where.push(`r.priority = ANY(${add(f.priority)}::request_priority[])`);
  if (f.unassigned) where.push('r.assignee_id IS NULL');
  else if (f.assigneeId) where.push(`r.assignee_id = ${add(f.assigneeId)}`);
  if (f.customerId) where.push(`r.customer_id = ${add(f.customerId)}`);
  if (f.overdue) where.push(`r.due_at < now() AND r.status IN ${OPEN}`);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function listRequests(db: Db, f: RequestFilter) {
  const { sql, params } = buildRequestWhere(f);
  const total = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM service_requests r JOIN customers c ON c.id = r.customer_id ${sql}`,
    params,
  );
  const { rows } = await db.query<RequestListRow>(
    `SELECT ${COLUMNS} FROM service_requests r ${JOINS} ${sql}
      ORDER BY ${REQUEST_SORTS[f.sort]}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.pageSize, (f.page - 1) * f.pageSize],
  );
  return { items: rows, total: total.rows[0]!.total, page: f.page, pageSize: f.pageSize };
}

export async function getRequest(db: Db, id: string): Promise<RequestDetailRow | null> {
  const { rows } = await db.query<RequestDetailRow>(
    `SELECT ${COLUMNS}, r.description, r.created_by AS "createdById", cb.full_name AS "createdByName"
       FROM service_requests r ${JOINS}
       JOIN users cb ON cb.id = r.created_by
      WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface LockedRequest {
  id: string;
  ref: number;
  status: Status;
  assigneeId: string | null;
  version: number;
  title: string;
}

/**
 * Row lock for the duration of a transaction. `update` blocks concurrent writers of the request;
 * `share` is taken by task changes so they cannot interleave with a status change that checks tasks.
 */
export async function lockRequest(
  db: Db,
  id: string,
  mode: 'update' | 'share',
): Promise<LockedRequest | null> {
  const { rows } = await db.query<LockedRequest>(
    `SELECT id, ref, status, assignee_id AS "assigneeId", version, title
       FROM service_requests WHERE id = $1
       ${mode === 'update' ? 'FOR UPDATE' : 'FOR SHARE'}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertRequest(
  db: Db,
  v: {
    customerId: string;
    title: string;
    description: string;
    priority: Priority;
    dueAt: string | null;
    createdBy: string;
  },
): Promise<{ id: string; ref: number }> {
  const { rows } = await db.query<{ id: string; ref: number }>(
    `INSERT INTO service_requests (customer_id, title, description, priority, due_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, ref`,
    [v.customerId, v.title, v.description, v.priority, v.dueAt, v.createdBy],
  );
  return rows[0]!;
}

export interface RequestPatch {
  title?: string | undefined;
  description?: string | undefined;
  priority?: Priority | undefined;
  dueAt?: string | null | undefined;
  status?: Status | undefined;
  assigneeId?: string | null | undefined;
  resolvedAt?: 'now' | null | undefined;
}

const PATCH_COLUMNS: Record<Exclude<keyof RequestPatch, 'resolvedAt'>, string> = {
  title: 'title',
  description: 'description',
  priority: 'priority',
  dueAt: 'due_at',
  status: 'status',
  assigneeId: 'assignee_id',
};

/** Applies a patch with an optimistic version check. Returns the new version, or null on mismatch. */
export async function patchRequest(
  db: Db,
  id: string,
  expectedVersion: number,
  patch: RequestPatch,
): Promise<number | null> {
  const sets: string[] = [];
  const params: unknown[] = [id, expectedVersion];
  for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof typeof PATCH_COLUMNS, string][]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (patch.resolvedAt === 'now') sets.push('resolved_at = now()');
  else if (patch.resolvedAt === null) sets.push('resolved_at = NULL');
  const { rows } = await db.query<{ version: number }>(
    `UPDATE service_requests
        SET ${[...sets, 'version = version + 1', 'updated_at = now()'].join(', ')}
      WHERE id = $1 AND version = $2
      RETURNING version`,
    params,
  );
  return rows[0]?.version ?? null;
}

export async function countOpenTasks(db: Db, requestId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tasks WHERE request_id = $1 AND NOT is_done',
    [requestId],
  );
  return rows[0]!.n;
}

export interface NoteRow {
  id: string;
  kind: 'comment' | 'resolution' | 'cancellation' | 'hold';
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export async function insertNote(
  db: Db,
  v: { requestId: string; authorId: string; kind: NoteRow['kind']; body: string },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO request_notes (request_id, author_id, kind, body) VALUES ($1, $2, $3, $4) RETURNING id',
    [v.requestId, v.authorId, v.kind, v.body],
  );
  return rows[0]!.id;
}

export async function listNotes(db: Db, requestId: string): Promise<NoteRow[]> {
  const { rows } = await db.query<NoteRow>(
    `SELECT n.id, n.kind, n.body, n.author_id AS "authorId", u.full_name AS "authorName", n.created_at AS "createdAt"
       FROM request_notes n JOIN users u ON u.id = n.author_id
      WHERE n.request_id = $1 ORDER BY n.created_at, n.id`,
    [requestId],
  );
  return rows;
}
