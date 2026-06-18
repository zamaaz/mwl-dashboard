import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

// Generic query wrappers to match previous SQLite interface
export async function dbAll<T>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(convertSql(sql), params);
  return result.rows as T[];
}

export async function dbGet<T>(sql: string, params: any[] = []): Promise<T> {
  const result = await pool.query(convertSql(sql), params);
  return result.rows[0] as T;
}

export async function dbRun(sql: string, params: any[] = []): Promise<{ lastID: number, changes: number }> {
  const result = await pool.query(convertSql(sql), params);
  // Postgres returns the id if "RETURNING id" is used, otherwise lastID is 0.
  // We simulate lastID for compatibility.
  const lastID = result.rows && result.rows.length > 0 ? result.rows[0].id : 0;
  return { lastID, changes: result.rowCount || 0 };
}

// Optional: you can still expose pool if needed directly
export function getDb() {
  return pool;
}

// Closes the connection pool
export async function closeDb(): Promise<void> {
  await pool.end();
}

/**
 * Converts SQLite `?` parameters to Postgres `$1, $2` etc.
 */
function convertSql(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}
