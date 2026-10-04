import type { Db } from '../../db/pool.js';

export interface CustomerRow {
  id: string;
  name: string;
  contactName: string;
  email: string | null;
  phone: string;
  address: string;
  city: string;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  openRequests: number;
  totalRequests: number;
}

export interface CustomerFields {
  name: string;
  contactName: string;
  email: string | null;
  phone: string;
  address: string;
  city: string;
  notes: string;
}

const COLUMNS = `
  c.id, c.name, c.contact_name AS "contactName", c.email, c.phone, c.address, c.city, c.notes, c.version,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt",
  coalesce(rc.open_requests, 0)::int AS "openRequests",
  coalesce(rc.total_requests, 0)::int AS "totalRequests"`;

const REQUEST_COUNTS = `
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.status IN ('new', 'assigned', 'in_progress', 'on_hold')) AS open_requests,
           count(*) AS total_requests
      FROM service_requests r
     WHERE r.customer_id = c.id
  ) rc ON true`;

/** Whitelisted sort keys. User input selects a key; it never reaches SQL directly. */
export const CUSTOMER_SORTS = {
  name: 'lower(c.name) ASC, c.id',
  '-name': 'lower(c.name) DESC, c.id',
  city: 'lower(c.city) ASC, lower(c.name), c.id',
  '-city': 'lower(c.city) DESC, lower(c.name), c.id',
  open: '"openRequests" ASC, lower(c.name), c.id',
  '-open': '"openRequests" DESC, lower(c.name), c.id',
  created: 'c.created_at ASC, c.id',
  '-created': 'c.created_at DESC, c.id',
} as const;
export type CustomerSort = keyof typeof CUSTOMER_SORTS;

export interface CustomerFilter {
  q?: string | undefined;
  city?: string | undefined;
  sort: CustomerSort;
  page: number;
  pageSize: number;
}

export async function listCustomers(db: Db, f: CustomerFilter) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${escapeLike(f.q)}%`);
    where.push(`(c.name ILIKE $${params.length} OR c.contact_name ILIKE $${params.length})`);
  }
  if (f.city) {
    params.push(f.city);
    where.push(`lower(c.city) = lower($${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM customers c ${whereSql}`,
    params,
  );
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const { rows } = await db.query<CustomerRow>(
    `SELECT ${COLUMNS} FROM customers c ${REQUEST_COUNTS} ${whereSql}
      ORDER BY ${CUSTOMER_SORTS[f.sort]}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows, total: total.rows[0]!.total, page: f.page, pageSize: f.pageSize };
}

export async function listCities(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ city: string }>('SELECT DISTINCT city FROM customers ORDER BY city');
  return rows.map((r) => r.city);
}

export async function getCustomer(db: Db, id: string): Promise<CustomerRow | null> {
  const { rows } = await db.query<CustomerRow>(
    `SELECT ${COLUMNS} FROM customers c ${REQUEST_COUNTS} WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertCustomer(db: Db, fields: CustomerFields): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO customers (name, contact_name, email, phone, address, city, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [fields.name, fields.contactName, fields.email, fields.phone, fields.address, fields.city, fields.notes],
  );
  return rows[0]!.id;
}

/** Optimistic update: succeeds only if the row still has `expectedVersion`. Returns false otherwise. */
export async function updateCustomer(
  db: Db,
  id: string,
  expectedVersion: number,
  fields: CustomerFields,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE customers
        SET name = $3, contact_name = $4, email = $5, phone = $6, address = $7, city = $8, notes = $9,
            version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $2`,
    [
      id,
      expectedVersion,
      fields.name,
      fields.contactName,
      fields.email,
      fields.phone,
      fields.address,
      fields.city,
      fields.notes,
    ],
  );
  return rowCount === 1;
}

export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
