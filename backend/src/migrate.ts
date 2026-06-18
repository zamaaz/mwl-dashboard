import { getDb, dbRun } from './database.js';

export async function runMigrations(): Promise<void> {
  // enable foreign keys - not needed in Postgres, it's default if constraints exist.
  // We'll just run our create tables.

  await dbRun(`
    -- =============================================
    -- Projects table
    -- =============================================
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      client TEXT NOT NULL,
      contractor TEXT NOT NULL,
      baseline_start TEXT NOT NULL,
      planned_finish TEXT NOT NULL,
      actual_finish TEXT,
      total_activities INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    -- =============================================
    -- Disciplines table
    -- =============================================
    CREATE TABLE IF NOT EXISTS disciplines (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      wbs_prefix TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    -- =============================================
    -- Baseline Activities table
    -- =============================================
    CREATE TABLE IF NOT EXISTS baseline_activities (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      discipline_id INTEGER NOT NULL,
      wbs TEXT NOT NULL,
      name TEXT NOT NULL,
      planned_start TEXT NOT NULL,
      planned_finish TEXT NOT NULL,
      planned_duration INTEGER NOT NULL DEFAULT 0,
      is_critical INTEGER NOT NULL DEFAULT 0,
      float_days INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      remarks TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_baseline_wbs_unique ON baseline_activities(project_id, wbs)`);

  await dbRun(`
    -- =============================================
    -- Users table
    -- =============================================
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'viewer')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    -- =============================================
    -- Reports table
    -- =============================================
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      period_label TEXT NOT NULL,
      report_date TEXT NOT NULL,
      period_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'validated', 'published', 'archived')),
      reporting_cutoff TEXT NOT NULL,
      upload_filename TEXT,
      upload_path TEXT,
      validation_results TEXT,
      executive_summary TEXT,
      computed_kpis TEXT,
      published_at TEXT,
      published_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (published_by) REFERENCES users(id)
    )
  `);

  await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_report_period ON reports(project_id, period_number)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_reports_project_status ON reports(project_id, status)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_reports_project_date ON reports(project_id, report_date DESC)`);

  await dbRun(`
    -- =============================================
    -- Report Activities table
    -- =============================================
    CREATE TABLE IF NOT EXISTS report_activities (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      baseline_activity_id INTEGER NOT NULL,
      wbs TEXT NOT NULL,
      activity_name TEXT NOT NULL,
      discipline_code TEXT NOT NULL,
      planned_start TEXT,
      planned_finish TEXT,
      planned_duration INTEGER DEFAULT 0,
      actual_start TEXT,
      actual_finish TEXT,
      actual_duration INTEGER,
      progress_pct REAL NOT NULL DEFAULT 0 CHECK(progress_pct >= 0 AND progress_pct <= 100),
      status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Complete')),
      is_critical INTEGER NOT NULL DEFAULT 0,
      float_days INTEGER,
      remarks TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (baseline_activity_id) REFERENCES baseline_activities(id)
    )
  `);

  await dbRun(`CREATE INDEX IF NOT EXISTS idx_report_activities_report ON report_activities(report_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_report_activities_wbs ON report_activities(report_id, wbs)`);

  await dbRun(`
    -- =============================================
    -- Report Disciplines table
    -- =============================================
    CREATE TABLE IF NOT EXISTS report_disciplines (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      discipline_id INTEGER NOT NULL,
      discipline_name TEXT NOT NULL,
      discipline_code TEXT NOT NULL,
      progress_pct REAL NOT NULL DEFAULT 0,
      total_activities INTEGER NOT NULL DEFAULT 0,
      completed_activities INTEGER NOT NULL DEFAULT 0,
      in_progress_activities INTEGER NOT NULL DEFAULT 0,
      not_started_activities INTEGER NOT NULL DEFAULT 0,
      status_label TEXT NOT NULL DEFAULT 'Not yet due',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (discipline_id) REFERENCES disciplines(id)
    )
  `);

  await dbRun(`
    -- =============================================
    -- Report KPIs table
    -- =============================================
    CREATE TABLE IF NOT EXISTS report_kpis (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      kpi_key TEXT NOT NULL,
      kpi_value REAL NOT NULL,
      kpi_display TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('ok', 'warn', 'danger', 'info')),
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    -- =============================================
    -- Report Snapshots table (immutable)
    -- =============================================
    CREATE TABLE IF NOT EXISTS report_snapshots (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL UNIQUE,
      full_snapshot TEXT NOT NULL,
      snapshot_version TEXT NOT NULL DEFAULT '1.0',
      frozen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    )
  `);

  console.log('✓ All migrations completed successfully.');
}
