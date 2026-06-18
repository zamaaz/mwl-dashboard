import { Router, Request, Response } from 'express';
import { getDb, dbGet, dbAll } from '../database.js';
import { getSnapshot, createSnapshot } from '../services/snapshotService.js';

const router = Router();

/**
 * GET /api/projects/:id
 * Get project metadata
 */
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
      const project = await dbGet('SELECT * FROM projects WHERE id = ?', [req.params.id]);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/projects/:id/reports/latest
 * Get the latest published report (full dashboard data from snapshot)
 */
router.get('/projects/:id/reports/latest', async (req: Request, res: Response) => {
  try {
      const report = await dbGet<{ id: number }>(`
        SELECT id FROM reports 
        WHERE project_id = ? AND status = 'published' 
        ORDER BY report_date DESC, period_number DESC 
        LIMIT 1
      `, [req.params.id]);

      if (!report) {
        return res.status(404).json({ error: 'No published reports found' });
      }

      let snapshot = await getSnapshot(report.id);
      if (!snapshot) {
        // Generate snapshot on-the-fly if missing
        snapshot = await createSnapshot(report.id);
      }

      res.json(snapshot);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/projects/:id/reports
 * List all published reports (for period selector)
 */
router.get('/projects/:id/reports', async (req: Request, res: Response) => {
  try {
      const reports = await dbAll(`
        SELECT id, period_label, report_date, period_number, status, published_at
        FROM reports 
        WHERE project_id = ? AND status = 'published'
        ORDER BY period_number DESC
      `, [req.params.id]);
      res.json(reports);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/reports/:id
 * Get a single report by ID (from snapshot)
 */
router.get('/reports/:id', async (req: Request, res: Response) => {
  try {
      const report = await dbGet<{ id: number; status: string; }>(
          'SELECT * FROM reports WHERE id = ?', [req.params.id]
      );

      if (!report) return res.status(404).json({ error: 'Report not found' });

      let snapshot = await getSnapshot(report.id);
      if (!snapshot) {
        snapshot = await createSnapshot(report.id);
      }

      res.json(snapshot);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/reports/:id/compare/:compareId
 * Compare two reports side by side
 */
router.get('/reports/:id/compare/:compareId', async (req: Request, res: Response) => {
  try {
      const snapshotA = await getSnapshot(Number(req.params.id));
      const snapshotB = await getSnapshot(Number(req.params.compareId));

      if (!snapshotA || !snapshotB) {
        return res.status(404).json({ error: 'One or both reports not found' });
      }

      // Build comparison
      const comparison = {
        period_a: { label: snapshotA.period_label, date: snapshotA.report_date, id: snapshotA.id },
        period_b: { label: snapshotB.period_label, date: snapshotB.report_date, id: snapshotB.id },
        overall_delta: {
          from: snapshotA.kpis.overall_progress?.value || 0,
          to: snapshotB.kpis.overall_progress?.value || 0,
          change: (snapshotB.kpis.overall_progress?.value || 0) - (snapshotA.kpis.overall_progress?.value || 0),
        },
        disciplines: snapshotB.disciplines.map(db => {
          const da = snapshotA.disciplines.find(d => d.code === db.code);
          return {
            name: db.name,
            code: db.code,
            from: da?.progress_pct || 0,
            to: db.progress_pct,
            change: db.progress_pct - (da?.progress_pct || 0),
          };
        }),
        activities: snapshotB.activities.map(ab => {
          const aa = snapshotA.activities.find(a => a.wbs === ab.wbs);
          return {
            wbs: ab.wbs,
            name: ab.name,
            from: aa?.progress_pct || 0,
            to: ab.progress_pct,
            change: ab.progress_pct - (aa?.progress_pct || 0),
          };
        }),
      };

      res.json(comparison);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

export default router;
