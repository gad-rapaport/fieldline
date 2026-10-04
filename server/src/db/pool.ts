import pg from 'pg';
import type { Config } from '../config.js';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
/** Anything that can run a query: the pool itself or a client inside a transaction. */
export type Db = pg.Pool | pg.PoolClient;

// Return bigint columns (request refs, activity ids) as JS numbers. Values stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));

export function createPool(
  config: Pick<Config, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_STATEMENT_TIMEOUT_MS'>,
): Pool {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    application_name: 'fieldline',
  });
}

type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  isolation: IsolationLevel = 'READ COMMITTED',
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
