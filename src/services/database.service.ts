import pg from 'pg';

import { logger } from '../logger.js';

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: /^\s*(true|1|yes|on)\s*$/i.test(process.env.PGSSL ?? '')
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected database error');
});

export async function query<T>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as pg.QueryConfig['values']);
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

export async function end(): Promise<void> {
  await pool.end();
}
