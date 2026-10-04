import type { Pool } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import { isUniqueViolation } from '../../db/errors.js';
import { AppError, forbidden, notFound, versionConflict } from '../../domain/errors.js';
import type { Actor } from '../../domain/permissions.js';
import { policy } from '../../domain/permissions.js';
import { recordActivity } from '../activity/repo.js';
import * as repo from './repo.js';
import type { CustomerFields, CustomerFilter, CustomerRow } from './repo.js';

export type CustomerView = Omit<CustomerRow, 'email' | 'phone' | 'contactName' | 'address'> & {
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contactHidden: boolean;
};

/** Viewers see who the customer is but not how to reach them. */
export function presentCustomer(row: CustomerRow, actor: Actor): CustomerView {
  if (policy.viewContactDetails(actor)) return { ...row, contactHidden: false };
  return { ...row, contactName: null, email: null, phone: null, address: null, contactHidden: true };
}

const duplicate = () =>
  new AppError(409, 'DUPLICATE', 'A customer with this name already exists in this city.', {
    fields: { name: 'A customer with this name already exists in this city.' },
  });

export async function listCustomers(pool: Pool, actor: Actor, filter: CustomerFilter) {
  const page = await repo.listCustomers(pool, filter);
  return { ...page, items: page.items.map((c) => presentCustomer(c, actor)) };
}

export async function getCustomer(pool: Pool, actor: Actor, id: string): Promise<CustomerView> {
  const row = await repo.getCustomer(pool, id);
  if (!row) throw notFound('Customer');
  return presentCustomer(row, actor);
}

export async function createCustomer(
  pool: Pool,
  actor: Actor,
  fields: CustomerFields,
): Promise<CustomerView> {
  if (!policy.createCustomer(actor)) throw forbidden();
  try {
    const id = await withTransaction(pool, async (tx) => {
      const newId = await repo.insertCustomer(tx, fields);
      await recordActivity(tx, {
        actorId: actor.id,
        entityType: 'customer',
        entityId: newId,
        action: 'customer.created',
        summary: `Created customer ${fields.name}`,
      });
      return newId;
    });
    return getCustomer(pool, actor, id);
  } catch (err) {
    if (isUniqueViolation(err, 'customers_name_city_uq')) throw duplicate();
    throw err;
  }
}

export async function updateCustomer(
  pool: Pool,
  actor: Actor,
  id: string,
  expectedVersion: number,
  fields: CustomerFields,
): Promise<CustomerView> {
  if (!policy.updateCustomer(actor)) throw forbidden();
  try {
    await withTransaction(pool, async (tx) => {
      const before = await repo.getCustomer(tx, id);
      if (!before) throw notFound('Customer');
      const updated = await repo.updateCustomer(tx, id, expectedVersion, fields);
      if (!updated) throw versionConflict(presentCustomer(before, actor));
      const changed = (Object.keys(fields) as (keyof CustomerFields)[]).filter(
        (k) => before[k] !== fields[k],
      );
      await recordActivity(tx, {
        actorId: actor.id,
        entityType: 'customer',
        entityId: id,
        action: 'customer.updated',
        summary: changed.length ? `Updated ${changed.join(', ')}` : 'Saved without changes',
        details: { changed },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err, 'customers_name_city_uq')) throw duplicate();
    throw err;
  }
  return getCustomer(pool, actor, id);
}
