import * as XLSX from 'xlsx';
import { getDb, dbGet, dbAll } from '../database.js';

interface ParsedActivity {
  row: number;
  id: number | null;
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

interface ParseResult {
  success: boolean;
  activities: ParsedActivity[];
  errors: string[];
}

/**
 * Parses an uploaded Excel file and extracts activity data.
 * Expects the template format: ID, WBS, Activity, Discipline, Start, Finish, Duration, Progress%, Status, Remarks
 */
export function parseExcelUpload(fileBuffer: Buffer): ParseResult {
  const errors: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    return { success: false, activities: [], errors: [`Failed to read Excel file: ${(err as Error).message}`] };
  }

  // Find the progress sheet
  const sheetName = workbook.SheetNames.find(
    s => s.toLowerCase().includes('progress') || s.toLowerCase().includes('schedule')
  ) || workbook.SheetNames[0];

  if (!sheetName) {
    return { success: false, activities: [], errors: ['No sheets found in workbook'] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1, defval: '' });

  if (rawData.length < 2) {
    return { success: false, activities: [], errors: ['Sheet has no data rows'] };
  }

  // Find header row (look for "WBS" or "Activity" in first 10 rows)
  let headerRowIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const row = rawData[i] as unknown[];
    const rowStrs = row.map(cell => String(cell || '').trim().toLowerCase());
    if (rowStrs.some(s => s === 'wbs' || s.includes('activity name') || s.includes('activity'))) {
      headerRowIdx = i;
      headers = row.map(cell => String(cell || '').trim().toLowerCase());
      break;
    }
  }

  if (headerRowIdx === -1) {
    return { success: false, activities: [], errors: ['Could not find header row. Expected columns: WBS, Activity Name, Discipline, etc.'] };
  }

  // Map column indices
  const colMap = {
    id: findColumn(headers, ['id', '#']),
    wbs: findColumn(headers, ['wbs']),
    name: findColumn(headers, ['activity name', 'activity', 'name']),
    discipline: findColumn(headers, ['discipline', 'disc.', 'disc']),
    start: findColumn(headers, ['start', 'planned start']),
    finish: findColumn(headers, ['finish', 'planned finish']),
    duration: findColumn(headers, ['duration', 'dur.', 'dur', 'duration\n(days)']),
    progress: findColumn(headers, ['progress %', 'progress', 'progress%', '% complete', 'pct']),
    status: findColumn(headers, ['status']),
    remarks: findColumn(headers, ['remarks', 'notes', 'comment']),
    critical: findColumn(headers, ['critical']),
    float: findColumn(headers, ['float', 'float\n(days)']),
  };

  if (colMap.wbs === -1) errors.push('Missing required column: WBS');
  if (colMap.name === -1) errors.push('Missing required column: Activity Name');
  if (colMap.progress === -1) errors.push('Missing required column: Progress %');

  if (errors.length > 0) {
    return { success: false, activities: [], errors };
  }

  // Parse data rows
  const activities: ParsedActivity[] = [];
  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || row.length === 0) continue;

    const wbs = String(row[colMap.wbs] || '').trim();
    const name = String(row[colMap.name] || '').trim();

    // Skip section header rows (no WBS code) and empty rows
    if (!wbs || wbs === '' || !wbs.match(/^\d+\.\d+/)) continue;

    const id = colMap.id !== -1 ? parseNumber(row[colMap.id]) : null;
    const discipline = colMap.discipline !== -1 ? String(row[colMap.discipline] || '').trim() : '';
    const start = colMap.start !== -1 ? parseDate(row[colMap.start]) : '';
    const finish = colMap.finish !== -1 ? parseDate(row[colMap.finish]) : '';
    const duration = colMap.duration !== -1 ? parseNumber(row[colMap.duration]) || 0 : 0;
    const progress = colMap.progress !== -1 ? parseNumber(row[colMap.progress]) ?? 0 : 0;
    const status = colMap.status !== -1 ? String(row[colMap.status] || '').trim() : deriveStatus(progress);
    const remarks = colMap.remarks !== -1 ? String(row[colMap.remarks] || '').trim() || null : null;

    activities.push({
      row: i + 1, // 1-indexed for user-facing messages
      id,
      wbs,
      activity_name: name,
      discipline_code: discipline,
      planned_start: start,
      planned_finish: finish,
      planned_duration: duration,
      progress_pct: progress,
      status: normalizeStatus(status),
      remarks,
    });
  }

  if (activities.length === 0) {
    return { success: false, activities: [], errors: ['No valid activity rows found in the uploaded file'] };
  }

  return { success: true, activities, errors };
}

/**
 * Generates a pre-filled Excel template from baseline activities.
 */
export async function generateTemplate(projectId: number): Promise<Buffer> {
  const project = await dbGet<{
    name: string; code: string;
  }>('SELECT * FROM projects WHERE id = ?', [projectId]);

  const activities = await dbAll<{
    id: number; wbs: string; name: string; discipline_code: string; discipline_name: string;
    planned_start: string; planned_finish: string; planned_duration: number;
    is_critical: number; float_days: number;
  }>(`
    SELECT ba.*, d.code as discipline_code, d.name as discipline_name
    FROM baseline_activities ba
    JOIN disciplines d ON d.id = ba.discipline_id
    WHERE ba.project_id = ?
    ORDER BY ba.sort_order
  `, [projectId]);

  // Build worksheet data
  const wsData: unknown[][] = [
    [`PROJECT PROGRESS UPDATE — ${project?.name || 'Unknown Project'}`],
    [`Template generated: ${new Date().toISOString().split('T')[0]}. Fill columns H, I, J only.`],
    [],
    ['ID', 'WBS', 'Activity Name', 'Discipline', 'Start', 'Finish', 'Duration\n(Days)', 'Progress %', 'Status', 'Remarks'],
  ];

  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    wsData.push([
      i + 1,
      a.wbs,
      a.name,
      a.discipline_code,
      a.planned_start,
      a.planned_finish,
      a.planned_duration,
      0,  // User fills this
      'Not Started',  // User fills this
      '',  // User fills this
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 4 },   // ID
    { wch: 6 },   // WBS
    { wch: 50 },  // Activity Name
    { wch: 10 },  // Discipline
    { wch: 12 },  // Start
    { wch: 12 },  // Finish
    { wch: 10 },  // Duration
    { wch: 12 },  // Progress %
    { wch: 14 },  // Status
    { wch: 30 },  // Remarks
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Progress Update');

  // Add instructions sheet
  const instrData = [
    ['INSTRUCTIONS'],
    [],
    ['1. This template contains your project baseline schedule.'],
    ['2. Columns A through G are pre-filled from the baseline. DO NOT modify them.'],
    ['3. Fill ONLY the following columns:'],
    ['   - Column H: Progress % (integer from 0 to 100)'],
    ['   - Column I: Status (Not Started, In Progress, or Complete)'],
    ['   - Column J: Remarks (optional free text)'],
    [],
    ['4. Upload the completed file through the Admin Portal.'],
    ['5. The system will validate your data before generating the report.'],
    [],
    ['VALIDATION RULES:'],
    ['- Progress must be between 0 and 100'],
    ['- Progress should not decrease from previous report unless intentional'],
    ['- All activities must be present (do not delete rows)'],
    ['- WBS codes must not be modified'],
  ];

  const instrWs = XLSX.utils.aoa_to_sheet(instrData);
  instrWs['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// =============================================
// Helper functions
// =============================================

function findColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.replace(/\n/g, ' ').trim() === candidate);
    if (idx !== -1) return idx;
  }
  // Partial match
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.replace(/\n/g, ' ').includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === '-') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function parseDate(val: unknown): string {
  if (!val || val === '' || String(val).toLowerCase() === 'ongoing') return String(val || '');
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  // Try common date formats
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return str;
}

function deriveStatus(progress: number): string {
  if (progress === 100) return 'Complete';
  if (progress > 0) return 'In Progress';
  return 'Not Started';
}

function normalizeStatus(status: string): string {
  const lower = status.toLowerCase().trim();
  if (lower === 'complete' || lower === 'completed' || lower === 'done') return 'Complete';
  if (lower === 'in progress' || lower === 'in-progress' || lower === 'active' || lower === 'ongoing') return 'In Progress';
  return 'Not Started';
}
