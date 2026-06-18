import type { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../backend/.env' });

// Lazy-load app to avoid import issues
let appPromise: Promise<any> | null = null;
let initialized = false;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      // Run migrations on first cold start
      const { runMigrations } = await import('../backend/src/migrate.js');
      await runMigrations();

      // Import the configured Express app
      const { default: app } = await import('../backend/src/server.js');
      initialized = true;
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req: Request, res: Response) {
  const app = await getApp();
  return app(req, res);
}
