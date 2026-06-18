import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runMigrations } from './migrate.js';
import { dbGet } from './database.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import { login, me, authMiddleware, AuthRequest } from './middleware/auth.js';

dotenv.config();


const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// Middleware
// =============================================
app.use(cors({
  origin: process.env.VERCEL === '1'
    ? true  // Allow same-origin on Vercel
    : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// =============================================
// Routes (registered immediately so they're available on Vercel)
// =============================================

// Auth routes (public)
app.post('/api/auth/login', login);
app.get('/api/auth/me', authMiddleware, (req, res) => me(req as AuthRequest, res));

// Public dashboard API
app.use('/api', dashboardRoutes);

// Admin API (authenticated)
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================
// Initialize database & Start Server (local only)
// =============================================
async function bootstrap() {
  await runMigrations();

  // Check if seeded
  const projectCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM projects');
  if (projectCount.count === 0) {
    console.log('⚡ Database is empty. Run "npm run seed" to populate with MWL project data.');
  }

  // Ensure initial report snapshot exists
  const publishedReport = await dbGet<{ id: number }>(
    "SELECT id FROM reports WHERE status = 'published' ORDER BY period_number DESC LIMIT 1"
  );

  if (publishedReport) {
    const hasSnapshot = await dbGet<{ count: number }>(
      'SELECT COUNT(*) as count FROM report_snapshots WHERE report_id = ?', [publishedReport.id]
    );

    if (hasSnapshot.count === 0) {
      console.log('⚡ Generating snapshot for existing published report...');
      const { createSnapshot, saveSnapshot } = await import('./services/snapshotService.js');
      const snapshot = await createSnapshot(publishedReport.id);
      await saveSnapshot(publishedReport.id, snapshot);
      console.log('✓ Snapshot generated.');
    }
  }
}

// Only start the HTTP server when running locally (not on Vercel)
if (process.env.VERCEL !== '1') {
  bootstrap().then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Project Dashboard API running at http://localhost:${PORT}`);
      console.log(`   Dashboard API: http://localhost:${PORT}/api/projects/1/reports/latest`);
      console.log(`   Admin API:     http://localhost:${PORT}/api/admin/reports`);
      console.log(`   Health check:  http://localhost:${PORT}/api/health\n`);
    });
  }).catch(console.error);
}

export default app;
