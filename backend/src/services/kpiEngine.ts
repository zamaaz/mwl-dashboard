import { dbAll } from '../database.js';

interface Activity {
  wbs: string;
  activity_name: string;
  discipline_code: string;
  planned_start: string;
  planned_finish: string;
  planned_duration: number;
  progress_pct: number;
  status: string;
  is_critical: number;
  float_days: number | null;
  remarks: string | null;
}

interface KpiResult {
  kpi_key: string;
  kpi_value: number;
  kpi_display: string;
  severity: 'ok' | 'warn' | 'danger' | 'info';
  description: string;
}

interface DisciplineResult {
  discipline_id: number;
  discipline_name: string;
  discipline_code: string;
  progress_pct: number;
  total_activities: number;
  completed_activities: number;
  in_progress_activities: number;
  not_started_activities: number;
  status_label: string;
}

export function computeKpis(
  activities: Activity[],
  projectPlannedFinish: string,
  reportDate: string
): KpiResult[] {
  const kpis: KpiResult[] = [];
  const reportDt = new Date(reportDate);
  const finishDt = new Date(projectPlannedFinish);

  // ------- Overall Progress (Average of Discipline Progress) -------
  const disciplines = new Set(activities.map(a => a.discipline_code));
  let sumDisciplineProgress = 0;

  for (const disc of disciplines) {
    const discActivities = activities.filter(a => a.discipline_code === disc);
    let discProgress = 0;
    if (discActivities.length > 0) {
      discProgress = Math.round(discActivities.reduce((sum, a) => sum + a.progress_pct, 0) / discActivities.length);
    }
    sumDisciplineProgress += discProgress;
  }
  
  const overallProgress = disciplines.size > 0 ? Math.round(sumDisciplineProgress / disciplines.size) : 0;

  kpis.push({
    kpi_key: 'overall_progress',
    kpi_value: overallProgress,
    kpi_display: `${overallProgress}%`,
    severity: overallProgress >= 70 ? 'ok' : overallProgress >= 30 ? 'warn' : 'danger',
    description: 'Actual vs planned',
  });

  // ------- SPI (Schedule Performance Index) -------
  let plannedWeightedProgress = 0;
  let totalWeight = 0;
  for (const a of activities) {
    const weight = Math.max(a.planned_duration, 1);
    totalWeight += weight;
    const startDt = new Date(a.planned_start);
    const endDt = new Date(a.planned_finish);
    let expectedPct: number;

    if (reportDt >= endDt) {
      expectedPct = 100;
    } else if (reportDt <= startDt) {
      expectedPct = 0;
    } else {
      const totalMs = endDt.getTime() - startDt.getTime();
      const elapsedMs = reportDt.getTime() - startDt.getTime();
      expectedPct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
    }
    plannedWeightedProgress += expectedPct * weight;
  }
  const plannedOverall = totalWeight > 0 ? plannedWeightedProgress / totalWeight : 0;
  // If we are at the very beginning and planned is 0, SPI is 1.0
  const spi = plannedOverall > 0 ? Math.round((overallProgress / plannedOverall) * 100) / 100 : 1.0;

  kpis.push({
    kpi_key: 'spi',
    kpi_value: spi,
    kpi_display: spi.toFixed(2),
    severity: spi >= 0.95 ? 'ok' : spi >= 0.8 ? 'warn' : 'danger',
    description: spi >= 0.95 ? 'On schedule' : spi >= 0.8 ? 'Slightly behind' : 'Behind schedule',
  });

  // ------- Days to Handover -------
  const daysToHandover = Math.ceil((finishDt.getTime() - reportDt.getTime()) / (1000 * 60 * 60 * 24));

  kpis.push({
    kpi_key: 'days_to_handover',
    kpi_value: daysToHandover,
    kpi_display: String(daysToHandover),
    severity: daysToHandover > 30 ? 'ok' : daysToHandover > 15 ? 'warn' : 'danger',
    description: formatDate(projectPlannedFinish),
  });

  // ------- Total Activities -------
  kpis.push({
    kpi_key: 'total_activities',
    kpi_value: activities.length,
    kpi_display: String(activities.length),
    severity: 'info',
    description: `Across ${disciplines.size} disciplines`,
  });

  // ------- Complete -------
  const completeCount = activities.filter(a => a.progress_pct === 100).length;
  kpis.push({
    kpi_key: 'completed',
    kpi_value: completeCount,
    kpi_display: String(completeCount),
    severity: 'ok',
    description: 'Items closed out',
  });

  // ------- In Progress -------
  const inProgressCount = activities.filter(a => a.progress_pct > 0 && a.progress_pct < 100).length;
  kpis.push({
    kpi_key: 'in_progress',
    kpi_value: inProgressCount,
    kpi_display: String(inProgressCount),
    severity: 'warn',
    description: 'Active activities',
  });

  // ------- Not Started -------
  const notStartedCount = activities.filter(a => a.progress_pct === 0).length;
  const overdueNotStarted = activities.filter(a => {
    if (a.progress_pct > 0) return false;
    const startDt = new Date(a.planned_start);
    return reportDt >= startDt;
  }).length;

  kpis.push({
    kpi_key: 'not_started',
    kpi_value: notStartedCount,
    kpi_display: String(notStartedCount),
    severity: overdueNotStarted > 0 ? 'danger' : notStartedCount > activities.length * 0.5 ? 'warn' : 'info',
    description: overdueNotStarted > 0 ? 'Incl. overdue items' : 'Pending start',
  });

  // ------- Critical Path Items -------
  const criticalItems = activities.filter(a => {
    if (a.progress_pct === 100) return false;
    const finishDt = new Date(a.planned_finish);
    const startDt = new Date(a.planned_start);
    const daysLeft = Math.ceil((finishDt.getTime() - reportDt.getTime()) / (1000 * 60 * 60 * 24));
    // Critical if 0% and start date passed
    if (a.progress_pct === 0 && reportDt >= startDt) return true;
    // Critical if < 50% and less than 14 days left
    if (daysLeft <= 14 && a.progress_pct < 50) return true;
    // Critical if marked as critical and significantly behind
    if (a.is_critical && a.progress_pct < 30 && daysLeft <= 30) return true;
    return false;
  }).length;

  kpis.push({
    kpi_key: 'critical_items',
    kpi_value: criticalItems,
    kpi_display: String(criticalItems),
    severity: criticalItems > 0 ? 'danger' : 'ok',
    description: criticalItems > 0 ? 'Needing escalation' : 'All on track',
  });

  return kpis;
}

export async function computeDisciplineProgress(
  activities: Activity[],
  reportDate: string,
  projectId: number
): Promise<DisciplineResult[]> {
  const disciplines = await dbAll<{ id: number; name: string; code: string; wbs_prefix: string; sort_order: number; }>(
    'SELECT * FROM disciplines WHERE project_id = ? ORDER BY sort_order',
    [projectId]
  );

  const reportDt = new Date(reportDate);
  const results: DisciplineResult[] = [];

  for (const disc of disciplines) {
    const discActivities = activities.filter(a => a.discipline_code === disc.code);
    if (discActivities.length === 0) {
      results.push({
        discipline_id: disc.id,
        discipline_name: disc.name,
        discipline_code: disc.code,
        progress_pct: 0,
        total_activities: 0,
        completed_activities: 0,
        in_progress_activities: 0,
        not_started_activities: 0,
        status_label: 'Not yet due',
      });
      continue;
    }

    // Equal weighting (simple average)
    let sumProgress = 0;
    for (const a of discActivities) {
      sumProgress += a.progress_pct;
    }
    const progressPct = discActivities.length > 0 ? Math.round(sumProgress / discActivities.length) : 0;

    const completed = discActivities.filter(a => a.progress_pct === 100).length;
    const inProgress = discActivities.filter(a => a.progress_pct > 0 && a.progress_pct < 100).length;
    const notStarted = discActivities.filter(a => a.progress_pct === 0).length;

    // Determine status label
    let statusLabel: string;
    const allNotYetDue = discActivities.every(a => new Date(a.planned_start) > reportDt);
    if (allNotYetDue) {
      statusLabel = 'Not yet due';
    } else if (progressPct >= 80) {
      statusLabel = 'Leading';
    } else if (progressPct >= 50) {
      statusLabel = 'On Track';
    } else if (progressPct >= 20) {
      statusLabel = 'At risk';
    } else {
      statusLabel = 'Under-mobilized';
    }

    results.push({
      discipline_id: disc.id,
      discipline_name: disc.name,
      discipline_code: disc.code,
      progress_pct: progressPct,
      total_activities: discActivities.length,
      completed_activities: completed,
      in_progress_activities: inProgress,
      not_started_activities: notStarted,
      status_label: statusLabel,
    });
  }

  return results;
}

/**
 * Generates S-curve data points (weekly intervals from project start to end).
 * Planned curve: interpolated from baseline schedule.
 * Actual curve: from reported progress (up to report date only).
 */
export function computeSCurve(
  activities: Activity[],
  projectStart: string,
  projectEnd: string,
  reportDate: string
): { labels: string[]; planned: number[]; actual: (number | null)[] } {
  const startDt = new Date(projectStart);
  const endDt = new Date(projectEnd);
  const reportDt = new Date(reportDate);

  // Generate weekly data points
  const labels: string[] = [];
  const planned: number[] = [];
  const actual: (number | null)[] = [];

  const current = new Date(startDt);
  while (current <= endDt) {
    labels.push(formatDate(current.toISOString().split('T')[0]));

    // Compute planned progress at this date
    let totalWeight = 0;
    let plannedWeighted = 0;
    let actualWeighted = 0;

    for (const a of activities) {
      const weight = Math.max(a.planned_duration, 1);
      totalWeight += weight;

      const aStart = new Date(a.planned_start);
      const aEnd = new Date(a.planned_finish);

      // Planned progress interpolation
      let expectedPct: number;
      if (current >= aEnd) {
        expectedPct = 100;
      } else if (current <= aStart) {
        expectedPct = 0;
      } else {
        const totalMs = aEnd.getTime() - aStart.getTime();
        const elapsedMs = current.getTime() - aStart.getTime();
        expectedPct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
      }
      plannedWeighted += expectedPct * weight;

      // Actual progress (only use reported value for dates up to and including report date)
      if (current <= reportDt) {
        // For dates before report date, interpolate from 0 to actual
        // For the report date itself, use actual progress
        const reportMs = reportDt.getTime() - aStart.getTime();
        const currentMs = current.getTime() - aStart.getTime();
        if (currentMs <= 0 || reportMs <= 0) {
          actualWeighted += 0;
        } else {
          const ratio = Math.min(currentMs / reportMs, 1);
          actualWeighted += a.progress_pct * ratio * weight;
        }
      }
    }

    const plannedPct = totalWeight > 0 ? Math.round(plannedWeighted / totalWeight) : 0;
    planned.push(plannedPct);

    if (current <= reportDt) {
      const actualPct = totalWeight > 0 ? Math.round(actualWeighted / totalWeight) : 0;
      actual.push(actualPct);
    } else {
      actual.push(null);
    }

    // Advance by 7 days
    current.setDate(current.getDate() + 7);
  }

  return { labels, planned, actual };
}

/**
 * Generates an alert message based on critical activities.
 */
export function generateAlert(
  activities: Activity[],
  reportDate: string
): { severity: string; message: string } | null {
  const reportDt = new Date(reportDate);

  // Find critical-risk activities: 0% progress but should have started
  const overdueZero = activities.filter(a => {
    const startDt = new Date(a.planned_start);
    return a.progress_pct === 0 && reportDt >= startDt;
  });

  // Find activities that are on critical path and behind
  const criticalBehind = activities.filter(a => {
    if (!a.is_critical || a.progress_pct === 100) return false;
    const startDt = new Date(a.planned_start);
    const endDt = new Date(a.planned_finish);
    if (reportDt < startDt) return false;
    const totalMs = endDt.getTime() - startDt.getTime();
    const elapsedMs = reportDt.getTime() - startDt.getTime();
    const expectedPct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
    return a.progress_pct < expectedPct * 0.7; // More than 30% behind expected
  });

  if (overdueZero.length === 0 && criticalBehind.length === 0) return null;

  const overdueNames = overdueZero.slice(0, 4).map(a => a.activity_name);
  const parts: string[] = [];

  if (overdueZero.length > 0) {
    parts.push(`${overdueZero.length} activities are at 0% with start dates already reached`);
    if (overdueNames.length > 0) {
      parts.push(`including ${overdueNames.join(', ')}`);
    }
  }

  // Find under-mobilized disciplines
  const discCounts: Record<string, number> = {};
  for (const a of overdueZero) {
    discCounts[a.discipline_code] = (discCounts[a.discipline_code] || 0) + 1;
  }
  const underDiscs = Object.entries(discCounts)
    .filter(([, count]) => count >= 2)
    .map(([code]) => code);
  if (underDiscs.length > 0) {
    parts.push(`${underDiscs.join(' and ')} disciplines are severely under-mobilized`);
  }

  return {
    severity: 'warning',
    message: `Immediate action required. ${parts.join(' — ')}.`,
  };
}

function formatDate(isoDate: string): string {
  const dt = new Date(isoDate);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(dt.getDate()).padStart(2, '0')} ${months[dt.getMonth()]}`;
}
