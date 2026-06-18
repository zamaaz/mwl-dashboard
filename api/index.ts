// Vercel Serverless Function Entry Point
// Env vars are injected by Vercel — no dotenv needed

import { runMigrations } from '../backend/src/migrate.js';
import app from '../backend/src/server.js';

let migrationsDone = false;

export default async function handler(req: any, res: any) {
  // Run migrations once per cold start
  if (!migrationsDone) {
    try {
      await runMigrations();
      migrationsDone = true;
    } catch (err) {
      console.error('Migration error:', err);
      // Continue anyway — tables may already exist
      migrationsDone = true;
    }
  }

  return app(req, res);
}
