import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft } from 'lucide-react';
import { KpiGrid } from './KpiGrid';
import { SCurveChart } from './SCurveChart';
import { DisciplineProgress } from './DisciplineProgress';
import { CriticalPath } from './CriticalPath';
import { ActivityTimeline } from './ActivityTimeline';
import { ActivityTable } from './ActivityTable';

interface SnapshotData {
  id: number;
  project: { name: string; code: string; client: string; contractor: string; baseline_start: string; planned_finish: string };
  period_label: string;
  report_date: string;
  status: string;
  kpis: Record<string, any>;
  disciplines: any[];
  activities: any[];
  critical_path: any[];
  s_curve: any;
  alert: any | null;
}

interface ReportPeriod {
  id: number;
  period_label: string;
  report_date: string;
  period_number: number;
}

type DetailView = 'timeline' | 'table' | 'scurve' | 'kpis' | 'disciplines' | 'critical';

export const Dashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [periods, setPeriods] = useState<ReportPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  useEffect(() => {
    // Fetch available periods
    axios.get('http://localhost:3001/api/projects/1/reports')
      .then(res => setPeriods(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const url = selectedPeriod
          ? `http://localhost:3001/api/reports/${selectedPeriod}`
          : 'http://localhost:3001/api/projects/1/reports/latest';
        const response = await axios.get(url);
        setSnapshot(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [selectedPeriod]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="font-heading text-lg text-muted-foreground">Loading report…</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-heading text-xl text-destructive mb-2">Error</h2>
          <p className="text-muted-foreground">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  const formatDate = (d: string) => {
    const dt = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  // Detail view rendering
  if (detailView) {
    const backBtn = (
      <button onClick={() => setDetailView(null)} className="flex items-center gap-1 text-sm text-accent hover:underline mb-6">
        <ArrowLeft size={14} /> Back to overview
      </button>
    );

    const wrap = (title: string, children: React.ReactNode) => (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {backBtn}
          <h2 className="font-heading text-2xl font-semibold mb-6">{title}</h2>
          {children}
        </div>
      </div>
    );

    switch (detailView) {
      case 'kpis':
        return wrap('Key Performance Indicators', <KpiGrid kpis={snapshot.kpis} />);
      case 'timeline':
        return (
          <div className="min-h-screen bg-background">
            <div className="max-w-6xl mx-auto px-6 py-8">
              <ActivityTimeline activities={snapshot.activities} isDetailedView onBack={() => setDetailView(null)} />
            </div>
          </div>
        );
      case 'table':
        return (
          <div className="min-h-screen bg-background">
            <div className="max-w-6xl mx-auto px-6 py-8">
              <ActivityTable activities={snapshot.activities} isDetailedView onBack={() => setDetailView(null)} />
            </div>
          </div>
        );
      case 'scurve':
        return wrap('S-Curve — Planned vs Actual', <div className="h-[600px]"><SCurveChart data={snapshot.s_curve} reportDate={snapshot.report_date} /></div>);
      case 'disciplines':
        return wrap('Discipline Progress', <div className="max-w-3xl"><DisciplineProgress disciplines={snapshot.disciplines} /></div>);
      case 'critical':
        return wrap('Critical Path', <div className="max-w-4xl"><CriticalPath activities={snapshot.critical_path} isDetailedView /></div>);
    }
  }

  // Main dashboard
  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Top Bar */}
      <header className="border-b border-border bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground tracking-tight leading-tight">{snapshot.project.code}</h1>
            <p className="text-sm text-muted-foreground mt-1">{snapshot.project.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            {periods.length > 1 && (
              <select
                value={selectedPeriod ?? ''}
                onChange={e => setSelectedPeriod(e.target.value ? Number(e.target.value) : null)}
                className="text-sm bg-secondary/50 border border-border rounded px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Latest Update</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.period_label} — {formatDate(p.report_date)}</option>
                ))}
              </select>
            )}
            <div className="text-left md:text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{snapshot.period_label}</p>
              <p className="text-sm md:text-base font-medium">{formatDate(snapshot.report_date)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Alert Banner */}
        {snapshot.alert && (
          <div className="mb-6 px-4 py-3 rounded border border-warning/30 bg-warning/5 text-sm text-foreground">
            <span className="font-semibold">⚠ {snapshot.alert.severity === 'Critical' ? 'Critical' : 'Attention'}:</span>{' '}
            {snapshot.alert.message}
          </div>
        )}

        {/* KPI Row */}
        <section className="mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">Key Performance Indicators</h2>
            <button onClick={() => setDetailView('kpis')} className="text-xs text-accent hover:underline">View detail →</button>
          </div>
          <KpiGrid kpis={snapshot.kpis} />
        </section>

        {/* Two Column: S-Curve + Discipline Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
          <section className="lg:col-span-3">
            <div className="border border-border rounded bg-white p-5">
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">S-Curve — Planned vs Actual</h2>
                <button onClick={() => setDetailView('scurve')} className="text-xs text-accent hover:underline">Expand →</button>
              </div>
              <div className="h-[380px]">
                <SCurveChart data={snapshot.s_curve} reportDate={snapshot.report_date} />
              </div>
            </div>
          </section>

          <section className="lg:col-span-2">
            <div className="border border-border rounded bg-white p-5 h-full">
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">Discipline Progress</h2>
                <button onClick={() => setDetailView('disciplines')} className="text-xs text-accent hover:underline">Detail →</button>
              </div>
              <DisciplineProgress disciplines={snapshot.disciplines} />
            </div>
          </section>
        </div>

        {/* Activity Timeline */}
        <section className="mb-6">
          <div className="border border-border rounded bg-white p-5">
            <ActivityTimeline
              activities={snapshot.activities}
              onViewDetails={() => setDetailView('timeline')}
            />
          </div>
        </section>

        {/* Critical Path */}
        <section className="mb-6">
          <div className="border border-border rounded bg-white p-5">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">Critical Path — Escalation Required</h2>
              <button onClick={() => setDetailView('critical')} className="text-xs text-accent hover:underline">View all →</button>
            </div>
            <CriticalPath activities={snapshot.critical_path} onViewDetails={() => setDetailView('critical')} />
          </div>
        </section>

        {/* Full Activity Table */}
        <section className="mb-8">
          <div className="border border-border rounded bg-white p-5">
            <ActivityTable
              activities={snapshot.activities}
              onViewDetails={() => setDetailView('table')}
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pb-6 border-t border-border pt-4">
          {snapshot.project.client} · {snapshot.project.contractor} · Report generated {formatDate(snapshot.report_date)}
        </footer>
      </main>
    </div>
  );
};
