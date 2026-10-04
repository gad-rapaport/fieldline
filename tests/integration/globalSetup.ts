import pg from 'pg';
import { migrate } from '../../server/src/db/migrate.js';
import { createPool } from '../../server/src/db/pool.js';
import { adminDatabaseUrl, TEST_DB, testDatabaseUrl } from './dbUrl.js';

/** Creates a fresh, migrated test database on the server given by TEST_DATABASE_URL. */
export default async function setup() {
  const admin = new pg.Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const pool = createPool({
    DATABASE_URL: testDatabaseUrl(),
    DB_POOL_MAX: 2,
    DB_STATEMENT_TIMEOUT_MS: 10_000,
  });
  await migrate(pool);
  await pool.end();
}
