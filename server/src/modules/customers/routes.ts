import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { expectedVersion, optionalText, pagination, parse, uuidParam } from '../../http/validation.js';
import { requireAuth } from '../../http/auth.js';
import { CUSTOMER_SORTS, listCities } from './repo.js';
import type { CustomerSort } from './repo.js';
import * as service from './service.js';
import * as requestsRepo from '../requests/repo.js';

const listQuery = z.object({
  q: optionalText(100),
  city: optionalText(80),
  sort: z.enum(Object.keys(CUSTOMER_SORTS) as [CustomerSort, ...CustomerSort[]]).default('name'),
  ...pagination,
});

const customerBody = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(160),
  contactName: z.string().trim().max(120).default(''),
  email: z
    .union([z.literal(''), z.email('Enter a valid email address.').max(200)])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces and + ( ) - only.')
    .default(''),
  address: z.string().trim().max(240).default(''),
  city: z.string().trim().min(1, 'City is required.').max(80),
  notes: z.string().trim().max(2000).default(''),
});

export function customerRoutes(app: FastifyInstance, pool: Pool) {
  app.get('/api/customers', async (req) => {
    const actor = requireAuth(req);
    return service.listCustomers(pool, actor, parse(listQuery, req.query));
  });

  app.get('/api/customers/cities', async (req) => {
    requireAuth(req);
    return { items: await listCities(pool) };
  });

  app.get('/api/customers/:id', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const customer = await service.getCustomer(pool, actor, id);
    const recentRequests = await requestsRepo.listRequests(pool, {
      customerId: id,
      sort: '-created',
      page: 1,
      pageSize: 10,
    });
    return { customer, recentRequests: recentRequests.items };
  });

  app.post('/api/customers', async (req, reply) => {
    const actor = requireAuth(req);
    const body = parse(customerBody, req.body);
    const customer = await service.createCustomer(pool, actor, body);
    return reply.code(201).send(customer);
  });

  app.put('/api/customers/:id', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const body = parse(customerBody.extend({ expectedVersion }), req.body);
    const { expectedVersion: version, ...fields } = body;
    return service.updateCustomer(pool, actor, id, version, fields);
  });
}
