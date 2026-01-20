import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'pei',
  password: process.env.DB_PASSWORD || 'pei_dev_password',
  database: process.env.DB_NAME || 'platform_events',
});

export const db = drizzle(pool, { schema });
export { pool };
