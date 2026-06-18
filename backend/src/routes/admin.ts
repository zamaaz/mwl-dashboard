import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, dbGet, dbAll, dbRun } from '../database.js';
import { AuthRequest, authMiddleware, adminOnly } from '../middleware/auth.js';
import { parseExcelUpload, generateTemplate } from '../services/excelImportService.js';
import { validateUpload } from '../services/validationService.js';
import { createSnapshot, saveSnapshot } from '../services/snapshotService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Apply auth to all admin routes
router.use(authMiddleware);
router.use(adminOnly);

// Configure multer for file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/**
 * GET /api/admin/reports
 * List all reports (including drafts) for the project
 */
router.get('/reports', async (req: AuthRequest, res: Response) => {
  try {
      const projectId = req.query.project_id || 1;
      const reports = await dbAll(`
        SELECT r.*, u.name as created_by_name
        FROM reports r
        JOIN users u ON u.id = r.created_by
        WHERE r.project_id = ?
        ORDER BY r.period_number DESC
      `, [projectId]);
      res.json(reports);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/admin/reports
 * Create a new reporting period (draft)
 */
router.post('/reports', async (req: AuthRequest, res: Response) => {
  const { period_label, report_date, project_id = 1 } = req.body;

  if (!period_label || !report_date) {
    return res.status(400).json({ error: 'period_label and report_date are required' });
  }

  try {
    // Auto-calculate period number
    const lastReport = await dbGet<{ max_num: number | null }>(
      'SELECT MAX(period_number) as max_num FROM reports WHERE project_id = ?', [project_id]
    );
    const periodNumber = (lastReport?.max_num || 0) + 1;

    const result = await dbRun(`
      INSERT INTO reports (project_id, created_by, period_label, report_date, period_number, status, reporting_cutoff)
      VALUES (?, ?, ?, ?, ?, 'draft', ?) RETURNING id
    `, [project_id, req.user!.id, period_label, report_date, periodNumber, report_date]);

    const report = await dbGet('SELECT * FROM reports WHERE id = ?', [result.lastID]);
    res.status(201).json(report);
  } catch (err: unknown) {
    const error = err as { message: string };
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A report for this period already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/admin/reports/:id
 * Get single report detail
 */
router.get('/reports/:id', async (req: AuthRequest, res: Response) => {
  try {
      const report = await dbGet(`
        SELECT r.*, u.name as created_by_name
        FROM reports r
        JOIN users u ON u.id = r.created_by
        WHERE r.id = ?
      `, [req.params.id]);

      if (!report) return res.status(404).json({ error: 'Report not found' });
      res.json(report);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/admin/reports/:id/upload
 * Upload Excel file for a draft report
 */
router.post('/reports/:id/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
      const reportId = Number(req.params.id);

      const report = await dbGet<{
        id: number; project_id: number; status: string;
      }>('SELECT * FROM reports WHERE id = ?', [reportId]);

      if (!report) return res.status(404).json({ error: 'Report not found' });
      if (report.status === 'published') {
        return res.status(400).json({ error: 'Cannot upload to a published report' });
      }

      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      // Parse the Excel file from buffer
      const parseResult = parseExcelUpload(req.file.buffer);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Failed to parse Excel file', details: parseResult.errors });
      }

      // Get baseline and previous report for validation
      const baselineActivities = await dbAll<{ wbs: string; name: string; discipline_code: string }>(`
        SELECT ba.wbs, ba.name, d.code as discipline_code
        FROM baseline_activities ba
        JOIN disciplines d ON d.id = ba.discipline_id
        WHERE ba.project_id = ?
      `, [report.project_id]);

      const validDisciplinesRaw = await dbAll<{ code: string }>(
        'SELECT code FROM disciplines WHERE project_id = ?', [report.project_id]
      );
      const validDisciplines = validDisciplinesRaw.map(d => d.code);

      // Get previous report's activities for regression check
      const prevReport = await dbGet<{ id: number }>(`
        SELECT id FROM reports 
        WHERE project_id = ? AND status = 'published' AND period_number < (SELECT period_number FROM reports WHERE id = ?)
        ORDER BY period_number DESC LIMIT 1
      `, [report.project_id, reportId]);

      let previousActivities: Array<{ wbs: string; progress_pct: number }> | null = null;
      if (prevReport) {
        previousActivities = await dbAll<{ wbs: string; progress_pct: number }>(
          'SELECT wbs, progress_pct FROM report_activities WHERE report_id = ?', [prevReport.id]
        );
      }

      // Run validation
      const validationResult = validateUpload(
        parseResult.activities,
        baselineActivities,
        previousActivities,
        validDisciplines
      );

      // Store report activities (even if there are warnings, but not errors)
      if (validationResult.errors.length === 0) {
          
        await new Promise<void>(async (resolve, reject) => {
            const db = getDb();
            try {
                // We need baseline details
                const baselineDetails = await dbAll<{
                    id: number; wbs: string; name: string; discipline_code: string;
                    planned_start: string; planned_finish: string; planned_duration: number;
                    is_critical: number; float_days: number;
                }>(`
                    SELECT ba.*, d.code as discipline_code
                    FROM baseline_activities ba
                    JOIN disciplines d ON d.id = ba.discipline_id
                    WHERE ba.project_id = ?
                `, [report.project_id]);
                
                const baselineMap = new Map<string, number>(baselineDetails.map(b => [b.wbs, b.id]));
                const baselineDetailMap = new Map(baselineDetails.map(b => [b.wbs, b]));

                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');
                    db.run('DELETE FROM report_activities WHERE report_id = ?', [reportId]);
                    
                    const stmt = db.prepare(`
                        INSERT INTO report_activities 
                        (report_id, baseline_activity_id, wbs, activity_name, discipline_code,
                        planned_start, planned_finish, planned_duration, progress_pct, status, is_critical, float_days, remarks)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    for (const a of parseResult.activities) {
                        const baselineId = baselineMap.get(a.wbs) || 0;
                        const baseline = baselineDetailMap.get(a.wbs);
                        
                        stmt.run(
                        reportId,
                        baselineId,
                        a.wbs,
                        baseline?.name || a.activity_name,
                        baseline?.discipline_code || a.discipline_code,
                        baseline?.planned_start || a.planned_start,
                        baseline?.planned_finish || a.planned_finish,
                        baseline?.planned_duration || a.planned_duration,
                        a.progress_pct,
                        a.status,
                        baseline?.is_critical || 0,
                        baseline?.float_days || 0,
                        a.remarks
                        );
                    }
                    stmt.finalize();
                    db.run('COMMIT', () => resolve());
                });
            } catch(e) {
                db.run('ROLLBACK');
                reject(e);
            }
        });

        // Update report metadata
        const newStatus = validationResult.warnings.length > 0 ? 'draft' : 'validated';
        await dbRun(`
          UPDATE reports 
          SET upload_filename = ?, upload_path = ?, validation_results = ?, status = ?, updated_at = NOW()
          WHERE id = ?
        `, [
          req.file!.originalname,
          'memory',
          JSON.stringify(validationResult),
          newStatus,
          reportId
        ]);
      } else {
        // Just store validation results, don't import
        await dbRun(`
          UPDATE reports 
          SET upload_filename = ?, upload_path = ?, validation_results = ?, updated_at = NOW()
          WHERE id = ?
        `, [
          req.file!.originalname,
          'memory',
          JSON.stringify(validationResult),
          reportId
        ]);
      }

      res.json({
        message: validationResult.errors.length === 0 ? 'File uploaded and validated' : 'File has validation errors',
        validation: validationResult,
        activities_imported: validationResult.errors.length === 0 ? parseResult.activities.length : 0,
      });
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/admin/reports/:id/validate
 * Re-run validation on existing report data
 */
router.get('/reports/:id/validate', async (req: AuthRequest, res: Response) => {
  try {
      const report = await dbGet<{
        validation_results: string | null;
      }>('SELECT * FROM reports WHERE id = ?', [req.params.id]);

      if (!report) return res.status(404).json({ error: 'Report not found' });
      
      const validation = report.validation_results ? JSON.parse(report.validation_results) : null;
      res.json(validation);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/admin/reports/:id/preview
 * Preview report as it would appear on the dashboard
 */
router.get('/reports/:id/preview', async (req: AuthRequest, res: Response) => {
  try {
      const reportId = Number(req.params.id);

      const report = await dbGet('SELECT * FROM reports WHERE id = ?', [reportId]);
      if (!report) return res.status(404).json({ error: 'Report not found' });

      // Check if activities exist
      const actCount = await dbGet<{ count: number }>(
        'SELECT COUNT(*) as count FROM report_activities WHERE report_id = ?', [reportId]
      );

      if (!actCount || actCount.count === 0) {
        return res.status(400).json({ error: 'No activity data. Please upload an Excel file first.' });
      }

      const snapshot = await createSnapshot(reportId);
      res.json(snapshot);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/admin/reports/:id/publish
 * Publish a report (creates immutable snapshot)
 */
router.post('/reports/:id/publish', async (req: AuthRequest, res: Response) => {
  try {
      const reportId = Number(req.params.id);

      const report = await dbGet<{
        id: number; status: string; project_id: number;
      }>('SELECT * FROM reports WHERE id = ?', [reportId]);

      if (!report) return res.status(404).json({ error: 'Report not found' });
      if (report.status === 'published') {
        return res.status(400).json({ error: 'Report is already published' });
      }

      // Check if activities exist
      const actCount = await dbGet<{ count: number }>(
        'SELECT COUNT(*) as count FROM report_activities WHERE report_id = ?', [reportId]
      );

      if (!actCount || actCount.count === 0) {
        return res.status(400).json({ error: 'Cannot publish: no activity data' });
      }

      // Create and save snapshot
      const snapshot = await createSnapshot(reportId);
      await saveSnapshot(reportId, snapshot);

      // Update report status
      await dbRun(`
        UPDATE reports 
        SET status = 'published', published_at = NOW(), published_by = ?, updated_at = NOW()
        WHERE id = ?
      `, [req.user!.id, reportId]);

      res.json({ message: 'Report published successfully', snapshot });
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/admin/reports/:id/archive
 * Archive a published report (soft-status change)
 */
router.post('/reports/:id/archive', async (req: AuthRequest, res: Response) => {
  try {
      const reportId = Number(req.params.id);

      await dbRun(`
        UPDATE reports SET status = 'archived', updated_at = NOW() WHERE id = ?
      `, [reportId]);

      res.json({ message: 'Report archived' });
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * PATCH /api/admin/reports/:id
 * Update draft metadata
 */
router.patch('/reports/:id', async (req: AuthRequest, res: Response) => {
  try {
      const { period_label, report_date, executive_summary } = req.body;

      const updates: string[] = [];
      const values: unknown[] = [];

      if (period_label) { updates.push('period_label = ?'); values.push(period_label); }
      if (report_date) { updates.push('report_date = ?'); values.push(report_date); updates.push('reporting_cutoff = ?'); values.push(report_date); }
      if (executive_summary !== undefined) { updates.push('executive_summary = ?'); values.push(executive_summary); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      updates.push("updated_at = NOW()");
      values.push(req.params.id);

      await dbRun(`UPDATE reports SET ${updates.join(', ')} WHERE id = ?`, values);

      const report = await dbGet('SELECT * FROM reports WHERE id = ?', [req.params.id]);
      res.json(report);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/admin/reports/:id/template
 * Download pre-filled Excel template
 */
router.get('/reports/:id/template', async (req: AuthRequest, res: Response) => {
  try {
      const report = await dbGet<{
        project_id: number;
      }>('SELECT project_id FROM reports WHERE id = ?', [req.params.id]);

      if (!report) return res.status(404).json({ error: 'Report not found' });

      // Assuming generateTemplate handles DB interactions internally, 
      // but if it's synchronous it might need to be awaited if we update it.
      // Currently it's an ExcelJS write buffer operation. 
      // Let's assume we need to await it.
      const buffer = await generateTemplate(report.project_id);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="progress_template.xlsx"');
      res.send(buffer);
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

/**
 * DELETE /api/admin/reports/:id
 * Delete a draft report
 */
router.delete('/reports/:id', async (req: AuthRequest, res: Response) => {
  try {
      const report = await dbGet<{
        status: string;
      }>('SELECT status FROM reports WHERE id = ?', [req.params.id]);

      if (!report) return res.status(404).json({ error: 'Report not found' });
      if (report.status === 'published') {
        return res.status(400).json({ error: 'Cannot delete a published report. Archive it instead.' });
      }

      await dbRun('DELETE FROM reports WHERE id = ?', [req.params.id]);
      res.json({ message: 'Report deleted' });
  } catch (error) {
      res.status(500).json({ error: 'Database error' });
  }
});

export default router;
