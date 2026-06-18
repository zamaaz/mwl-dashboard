// =============================================
// Core Types for the Project Dashboard
// =============================================

export interface Project {
  name: string;
  code: string;
  client: string;
  contractor: string;
  baseline_start: string;
  planned_finish: string;
}

export interface KpiValue {
  value: number;
  display: string;
  severity: 'ok' | 'warn' | 'danger' | 'info';
  description: string;
}

export interface Discipline {
  name: string;
  code: string;
  progress_pct: number;
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  status_label: string;
}

export interface Activity {
  id: number;
  wbs: string;
  name: string;
  discipline: string;
  start: string;
  finish: string;
  duration: number;
  progress_pct: number;
  status: 'Not Started' | 'In Progress' | 'Complete';
  is_critical: boolean;
  float_days: number | null;
  remarks: string | null;
}

export interface CriticalPathItem {
  wbs: string;
  name: string;
  discipline: string;
  finish: string;
  progress_pct: number;
  days_left: number;
  risk: 'Critical' | 'High' | 'Medium';
}

export interface SCurveData {
  labels: string[];
  planned: number[];
  actual: (number | null)[];
}

export interface Alert {
  severity: string;
  message: string;
}

export interface ReportSnapshot {
  id: number;
  project: Project;
  period_label: string;
  report_date: string;
  period_number: number;
  status: string;
  kpis: Record<string, KpiValue>;
  disciplines: Discipline[];
  activities: Activity[];
  critical_path: CriticalPathItem[];
  s_curve: SCurveData;
  alert: Alert | null;
}

export interface ReportListItem {
  id: number;
  period_label: string;
  report_date: string;
  period_number: number;
  status: string;
  published_at: string | null;
}

export interface ValidationIssue {
  rule: string;
  severity: 'error' | 'warning';
  row: number | null;
  wbs: string | null;
  field: string | null;
  value?: unknown;
  previous_value?: unknown;
  new_value?: unknown;
  message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  can_publish: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: {
    total_rows: number;
    valid_rows: number;
    error_count: number;
    warning_count: number;
  };
}

export interface AdminReport {
  id: number;
  project_id: number;
  created_by: number;
  created_by_name: string;
  period_label: string;
  report_date: string;
  period_number: number;
  status: 'draft' | 'validated' | 'published' | 'archived';
  upload_filename: string | null;
  validation_results: string | null;
  executive_summary: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'viewer';
}

export interface ComparisonData {
  period_a: { label: string; date: string; id: number };
  period_b: { label: string; date: string; id: number };
  overall_delta: { from: number; to: number; change: number };
  disciplines: Array<{ name: string; code: string; from: number; to: number; change: number }>;
  activities: Array<{ wbs: string; name: string; from: number; to: number; change: number }>;
}
