import { getDb, dbGet, dbAll, dbRun } from '../database.js';
import { computeKpis, computeDisciplineProgress, computeSCurve, generateAlert } from './kpiEngine.js';

interface SnapshotData {
  id: number;
  project: {
    name: string;
    code: string;
    client: string;
    contractor: string;
    baseline_start: string;
    planned_finish: string;
  };
  period_label: string;
  report_date: string;
  period_number: number;
  status: string;
  kpis: Record<string, { value: number; display: string; severity: string; description: string }>;
  disciplines: Array<{
    name: string;
    code: string;
    progress_pct: number;
    total: number;
    completed: number;
    in_progress: number;
    not_started: number;
    status_label: string;
  }>;
  activities: Array<{
    id: number;
    wbs: string;
    name: string;
    discipline: string;
    start: string;
    finish: string;
    duration: number;
    progress_pct: number;
    status: string;
    is_critical: boolean;
    float_days: number | null;
    remarks: string | null;
  }>;
  critical_path: Array<{
    wbs: string;
    name: string;
    discipline: string;
    finish: string;
    progress_pct: number;
    days_left: number;
    risk: string;
  }>;
  s_curve: {
    labels: string[];
    planned: number[];
    actual: (number | null)[];
  };
  alert: { severity: string; message: string } | null;
}

/**
 * Creates an immutable snapshot of a report's complete dashboard state.
 * This snapshot is the exact data structure the frontend renders.
 */
export async function createSnapshot(reportId: number): Promise<SnapshotData> {
  // Get report
  const report = await dbGet<{
    id: number; project_id: number; period_label: string; report_date: string;
    period_number: number; status: string;
  }>('SELECT * FROM reports WHERE id = ?', [reportId]);

  if (!report) throw new Error(`Report ${reportId} not found`);

  // Get project
  const project = await dbGet<{
    id: number; name: string; code: string; client: string; contractor: string;
    baseline_start: string; planned_finish: string;
  }>('SELECT * FROM projects WHERE id = ?', [report.project_id]);
  
  if (!project) throw new Error(`Project ${report.project_id} not found`);

  // Get report activities
  const activities = await dbAll<{
    id: number; wbs: string; activity_name: string; discipline_code: string;
    planned_start: string; planned_finish: string; planned_duration: number;
    progress_pct: number; status: string; is_critical: number; float_days: number | null;
    remarks: string | null;
  }>('SELECT * FROM report_activities WHERE report_id = ? ORDER BY wbs', [reportId]);

  // Compute KPIs
  const kpiResults = computeKpis(
    activities.map(a => ({
      wbs: a.wbs,
      activity_name: a.activity_name,
      discipline_code: a.discipline_code,
      planned_start: a.planned_start,
      planned_finish: a.planned_finish,
      planned_duration: a.planned_duration,
      progress_pct: a.progress_pct,
      status: a.status,
      is_critical: a.is_critical,
      float_days: a.float_days,
      remarks: a.remarks,
    })),
    project.planned_finish,
    report.report_date
  );

  // Transform KPIs to dictionary
  const kpis: Record<string, { value: number; display: string; severity: string; description: string }> = {};
  for (const k of kpiResults) {
    kpis[k.kpi_key] = { value: k.kpi_value, display: k.kpi_display, severity: k.severity, description: k.description };
  }

  // Compute discipline progress
  const discResults = await computeDisciplineProgress(
    activities.map(a => ({
      wbs: a.wbs,
      activity_name: a.activity_name,
      discipline_code: a.discipline_code,
      planned_start: a.planned_start,
      planned_finish: a.planned_finish,
      planned_duration: a.planned_duration,
      progress_pct: a.progress_pct,
      status: a.status,
      is_critical: a.is_critical,
      float_days: a.float_days,
      remarks: a.remarks,
    })),
    report.report_date,
    report.project_id
  );

  // Compute S-curve
  const sCurve = computeSCurve(
    activities.map(a => ({
      wbs: a.wbs,
      activity_name: a.activity_name,
      discipline_code: a.discipline_code,
      planned_start: a.planned_start,
      planned_finish: a.planned_finish,
      planned_duration: a.planned_duration,
      progress_pct: a.progress_pct,
      status: a.status,
      is_critical: a.is_critical,
      float_days: a.float_days,
      remarks: a.remarks,
    })),
    project.baseline_start,
    project.planned_finish,
    report.report_date
  );

  // Build critical path entries
  const reportDt = new Date(report.report_date);
  const criticalPath = activities
    .filter(a => {
      if (a.progress_pct === 100) return false;
      const finishDt = new Date(a.planned_finish);
      const startDt = new Date(a.planned_start);
      const daysLeft = Math.ceil((finishDt.getTime() - reportDt.getTime()) / (1000 * 60 * 60 * 24));
      // Include if critical, behind schedule, or few days left
      if (a.is_critical) return true;
      if (a.progress_pct === 0 && reportDt >= startDt) return true;
      if (daysLeft <= 14 && a.progress_pct < 50) return true;
      return false;
    })
    .map(a => {
      const finishDt = new Date(a.planned_finish);
      const daysLeft = Math.ceil((finishDt.getTime() - reportDt.getTime()) / (1000 * 60 * 60 * 24));
      let risk: string;
      if (a.progress_pct === 0 && reportDt >= new Date(a.planned_start)) {
        risk = 'Critical';
      } else if (daysLeft <= 14) {
        risk = 'High';
      } else if (a.progress_pct < 30) {
        risk = 'High';
      } else {
        risk = 'Medium';
      }
      return {
        wbs: a.wbs,
        name: a.activity_name,
        discipline: a.discipline_code,
        finish: formatShortDate(a.planned_finish),
        progress_pct: a.progress_pct,
        days_left: daysLeft,
        risk,
      };
    })
    .sort((a, b) => {
      const riskOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2 };
      return (riskOrder[a.risk] || 3) - (riskOrder[b.risk] || 3);
    });

  // Generate alert
  const alert = generateAlert(
    activities.map(a => ({
      wbs: a.wbs,
      activity_name: a.activity_name,
      discipline_code: a.discipline_code,
      planned_start: a.planned_start,
      planned_finish: a.planned_finish,
      planned_duration: a.planned_duration,
      progress_pct: a.progress_pct,
      status: a.status,
      is_critical: a.is_critical,
      float_days: a.float_days,
      remarks: a.remarks,
    })),
    report.report_date
  );

  const snapshot: SnapshotData = {
    id: report.id,
    project: {
      name: project.name,
      code: project.code,
      client: project.client,
      contractor: project.contractor,
      baseline_start: project.baseline_start,
      planned_finish: project.planned_finish,
    },
    period_label: report.period_label,
    report_date: report.report_date,
    period_number: report.period_number,
    status: report.status,
    kpis,
    disciplines: discResults.map(d => ({
      name: d.discipline_name,
      code: d.discipline_code,
      progress_pct: d.progress_pct,
      total: d.total_activities,
      completed: d.completed_activities,
      in_progress: d.in_progress_activities,
      not_started: d.not_started_activities,
      status_label: d.status_label,
    })),
    activities: activities.map(a => ({
      id: a.id,
      wbs: a.wbs,
      name: a.activity_name,
      discipline: a.discipline_code,
      start: a.planned_start,
      finish: a.planned_finish,
      duration: a.planned_duration,
      progress_pct: a.progress_pct,
      status: a.status,
      is_critical: !!a.is_critical,
      float_days: a.float_days,
      remarks: a.remarks,
    })),
    critical_path: criticalPath,
    s_curve: sCurve,
    alert,
  };

  return snapshot;
}

/**
 * Saves the snapshot to the database.
 */
export async function saveSnapshot(reportId: number, snapshot: SnapshotData): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const db = getDb();
    db.serialize(async () => {
        try {
            db.run('BEGIN TRANSACTION');

            // Delete existing KPIs and disciplines for this report (in case of re-computation)
            db.run('DELETE FROM report_kpis WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM report_disciplines WHERE report_id = ?', [reportId]);

            // Insert KPIs
            const kpiStmt = db.prepare(`
                INSERT INTO report_kpis (report_id, kpi_key, kpi_value, kpi_display, severity, description)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const [key, kpi] of Object.entries(snapshot.kpis)) {
                kpiStmt.run(reportId, key, kpi.value, kpi.display, kpi.severity, kpi.description);
            }
            kpiStmt.finalize();

            // Insert discipline results
            db.all(
                'SELECT id, code FROM disciplines WHERE project_id = (SELECT project_id FROM reports WHERE id = ?)',
                [reportId],
                (err, disciplines: Array<{ id: number; code: string }>) => {
                    if (err) return reject(err);

                    const discIdMap = new Map(disciplines.map(d => [d.code, d.id]));
                    const discStmt = db.prepare(`
                        INSERT INTO report_disciplines 
                        (report_id, discipline_id, discipline_name, discipline_code, progress_pct,
                        total_activities, completed_activities, in_progress_activities, not_started_activities, status_label)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    for (const d of snapshot.disciplines) {
                        const discId = discIdMap.get(d.code) || 0;
                        discStmt.run(reportId, discId, d.name, d.code, d.progress_pct, d.total, d.completed, d.in_progress, d.not_started, d.status_label);
                    }
                    discStmt.finalize();

                    // Save/update snapshot
                    db.run('DELETE FROM report_snapshots WHERE report_id = ?', [reportId]);
                    db.run(`
                        INSERT INTO report_snapshots (report_id, full_snapshot, snapshot_version, frozen_at)
                        VALUES (?, ?, '1.0', NOW())
                    `, [reportId, JSON.stringify(snapshot)]);

                    // Update computed_kpis on report
                    db.run('UPDATE reports SET computed_kpis = ? WHERE id = ?', [JSON.stringify(snapshot.kpis), reportId]);

                    db.run('COMMIT', () => resolve());
                }
            );
        } catch(e) {
            db.run('ROLLBACK');
            reject(e);
        }
    });
  });
}

/**
 * Retrieves a saved snapshot.
 */
export async function getSnapshot(reportId: number): Promise<SnapshotData | null> {
  const row = await dbGet<{ full_snapshot: string }>('SELECT full_snapshot FROM report_snapshots WHERE report_id = ?', [reportId]);
  if (!row) return null;
  return JSON.parse(row.full_snapshot);
}

function formatShortDate(isoDate: string): string {
  const dt = new Date(isoDate);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(dt.getDate()).padStart(2, '0')}-${months[dt.getMonth()]}`;
}
