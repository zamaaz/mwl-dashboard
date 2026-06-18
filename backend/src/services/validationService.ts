/**
 * Validation Engine — runs all 10 validation rules on uploaded activity data.
 * Errors block publishing; warnings require acknowledgment.
 */

interface UploadedActivity {
  row: number;
  wbs: string;
  activity_name: string;
  discipline_code: string;
  planned_start: string;
  planned_finish: string;
  planned_duration: number;
  progress_pct: number;
  status: string;
  remarks: string | null;
}

interface BaselineActivity {
  wbs: string;
  name: string;
  discipline_code: string;
}

interface PreviousActivity {
  wbs: string;
  progress_pct: number;
}

interface ValidationIssue {
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

interface ValidationResult {
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

export function validateUpload(
  uploaded: UploadedActivity[],
  baseline: BaselineActivity[],
  previous: PreviousActivity[] | null,
  validDisciplines: string[]
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const baselineWbs = new Set(baseline.map(b => b.wbs));
  const uploadedWbs = uploaded.map(u => u.wbs);

  // =============================================
  // Rule 1: Progress Range (0–100)
  // =============================================
  for (const a of uploaded) {
    if (a.progress_pct < 0 || a.progress_pct > 100) {
      errors.push({
        rule: 'PROGRESS_RANGE',
        severity: 'error',
        row: a.row,
        wbs: a.wbs,
        field: 'progress_pct',
        value: a.progress_pct,
        message: `WBS ${a.wbs}: Progress ${a.progress_pct}% is out of valid range (0–100)`,
      });
    }
  }

  // =============================================
  // Rule 2: Progress Regression (compare to previous report)
  // =============================================
  if (previous && previous.length > 0) {
    const prevMap = new Map(previous.map(p => [p.wbs, p.progress_pct]));
    for (const a of uploaded) {
      const prevPct = prevMap.get(a.wbs);
      if (prevPct !== undefined && a.progress_pct < prevPct) {
        warnings.push({
          rule: 'PROGRESS_REGRESSION',
          severity: 'warning',
          row: a.row,
          wbs: a.wbs,
          field: 'progress_pct',
          previous_value: prevPct,
          new_value: a.progress_pct,
          message: `WBS ${a.wbs}: Progress decreased from ${prevPct}% to ${a.progress_pct}%. Confirm?`,
        });
      }
    }
  }

  // =============================================
  // Rule 3: Date Integrity
  // =============================================
  for (const a of uploaded) {
    if (a.planned_start && a.planned_finish && a.planned_finish !== 'Ongoing') {
      const start = new Date(a.planned_start);
      const finish = new Date(a.planned_finish);
      if (!isNaN(start.getTime()) && !isNaN(finish.getTime()) && finish < start) {
        errors.push({
          rule: 'DATE_INTEGRITY',
          severity: 'error',
          row: a.row,
          wbs: a.wbs,
          field: 'planned_finish',
          message: `WBS ${a.wbs}: Finish date is before start date`,
        });
      }
    }
  }

  // =============================================
  // Rule 4: Duplicate WBS
  // =============================================
  const wbsCounts = new Map<string, number[]>();
  for (const a of uploaded) {
    if (!wbsCounts.has(a.wbs)) wbsCounts.set(a.wbs, []);
    wbsCounts.get(a.wbs)!.push(a.row);
  }
  for (const [wbs, rows] of wbsCounts) {
    if (rows.length > 1) {
      errors.push({
        rule: 'DUPLICATE_WBS',
        severity: 'error',
        row: rows[0],
        wbs,
        field: 'wbs',
        message: `Duplicate WBS code '${wbs}' found in rows ${rows.join(' and ')}`,
      });
    }
  }

  // =============================================
  // Rule 5: Missing Activities
  // =============================================
  if (uploaded.length !== baseline.length) {
    const uploadedWbsSet = new Set(uploadedWbs);
    const missing = baseline.filter(b => !uploadedWbsSet.has(b.wbs)).map(b => b.wbs);
    const extra = uploadedWbs.filter(w => !baselineWbs.has(w));

    if (missing.length > 0) {
      warnings.push({
        rule: 'MISSING_ACTIVITIES',
        severity: 'warning',
        row: null,
        wbs: null,
        field: null,
        message: `Upload contains ${uploaded.length} activities but baseline has ${baseline.length}. Missing: ${missing.join(', ')}`,
      });
    }
    if (extra.length > 0) {
      warnings.push({
        rule: 'EXTRA_ACTIVITIES',
        severity: 'warning',
        row: null,
        wbs: null,
        field: null,
        message: `Upload contains ${extra.length} extra activities not in baseline: ${extra.join(', ')}`,
      });
    }
  }

  // =============================================
  // Rule 6: Required Fields
  // =============================================
  for (const a of uploaded) {
    const missingFields: string[] = [];
    if (!a.wbs || a.wbs.trim() === '') missingFields.push('WBS');
    if (!a.activity_name || a.activity_name.trim() === '') missingFields.push('Activity Name');
    if (!a.discipline_code || a.discipline_code.trim() === '') missingFields.push('Discipline');
    if (a.progress_pct === null || a.progress_pct === undefined || isNaN(a.progress_pct)) missingFields.push('Progress %');

    if (missingFields.length > 0) {
      errors.push({
        rule: 'REQUIRED_FIELDS',
        severity: 'error',
        row: a.row,
        wbs: a.wbs || '(empty)',
        field: null,
        message: `Row ${a.row}: Missing required field(s): ${missingFields.join(', ')}`,
      });
    }
  }

  // =============================================
  // Rule 7: Invalid Discipline
  // =============================================
  const validDiscSet = new Set(validDisciplines);
  for (const a of uploaded) {
    if (a.discipline_code && !validDiscSet.has(a.discipline_code)) {
      errors.push({
        rule: 'INVALID_DISCIPLINE',
        severity: 'error',
        row: a.row,
        wbs: a.wbs,
        field: 'discipline_code',
        value: a.discipline_code,
        message: `Row ${a.row}: Discipline '${a.discipline_code}' is not recognized`,
      });
    }
  }

  // =============================================
  // Rule 8: Status Consistency
  // =============================================
  for (const a of uploaded) {
    if (a.progress_pct === 100 && a.status !== 'Complete') {
      warnings.push({
        rule: 'STATUS_CONSISTENCY',
        severity: 'warning',
        row: a.row,
        wbs: a.wbs,
        field: 'status',
        message: `WBS ${a.wbs}: Progress is 100% but status is '${a.status}'`,
      });
    }
    if (a.progress_pct === 0 && a.status === 'Complete') {
      warnings.push({
        rule: 'STATUS_CONSISTENCY',
        severity: 'warning',
        row: a.row,
        wbs: a.wbs,
        field: 'status',
        message: `WBS ${a.wbs}: Progress is 0% but status is 'Complete'`,
      });
    }
  }

  // =============================================
  // Rule 9: WBS Mismatch
  // =============================================
  for (const a of uploaded) {
    if (a.wbs && !baselineWbs.has(a.wbs)) {
      errors.push({
        rule: 'WBS_MISMATCH',
        severity: 'error',
        row: a.row,
        wbs: a.wbs,
        field: 'wbs',
        message: `WBS '${a.wbs}' does not exist in the project baseline`,
      });
    }
  }

  // =============================================
  // Rule 10: Date Format
  // =============================================
  for (const a of uploaded) {
    if (a.planned_start && isNaN(new Date(a.planned_start).getTime())) {
      errors.push({
        rule: 'DATE_FORMAT',
        severity: 'error',
        row: a.row,
        wbs: a.wbs,
        field: 'planned_start',
        value: a.planned_start,
        message: `Row ${a.row}: Cannot parse start date '${a.planned_start}'`,
      });
    }
    if (a.planned_finish && a.planned_finish !== 'Ongoing' && isNaN(new Date(a.planned_finish).getTime())) {
      errors.push({
        rule: 'DATE_FORMAT',
        severity: 'error',
        row: a.row,
        wbs: a.wbs,
        field: 'planned_finish',
        value: a.planned_finish,
        message: `Row ${a.row}: Cannot parse finish date '${a.planned_finish}'`,
      });
    }
  }

  // =============================================
  // Compute summary
  // =============================================
  const errorRows = new Set(errors.map(e => e.row).filter(r => r !== null));
  const validRows = uploaded.length - errorRows.size;

  return {
    is_valid: errors.length === 0,
    can_publish: errors.length === 0,
    errors,
    warnings,
    summary: {
      total_rows: uploaded.length,
      valid_rows: validRows,
      error_count: errors.length,
      warning_count: warnings.length,
    },
  };
}
