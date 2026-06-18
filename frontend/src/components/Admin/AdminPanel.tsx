import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

interface Report {
  id: number;
  period_label: string;
  report_date: string;
  period_number: number;
  status: string;
  upload_filename: string | null;
  validation_results: string | null;
  published_at: string | null;
  created_at: string;
  created_by_name: string;
}

interface ValidationResult {
  is_valid: boolean;
  can_publish: boolean;
  errors: Array<{ rule: string; severity: string; wbs: string | null; message: string }>;
  warnings: Array<{ rule: string; severity: string; wbs: string | null; message: string }>;
  summary: { total_rows: number; valid_rows: number; error_count: number; warning_count: number };
}

export const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newLabel, setNewLabel] = useState('');
  const [newDate, setNewDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ message: string; validation: ValidationResult; activities_imported: number } | null>(null);

  // Actions
  const [publishing, setPublishing] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  // Preview
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Check auth
  useEffect(() => {
    if (!api.getToken()) {
      navigate('/admin/login');
    }
  }, [navigate]);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAdminReports();
      setReports(data as Report[]);
    } catch {
      navigate('/admin/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel || !newDate) return;
    setCreating(true);
    setActionMessage('');
    try {
      await api.createReport({ period_label: newLabel, report_date: newDate });
      setNewLabel('');
      setNewDate('');
      setShowCreate(false);
      await fetchReports();
      setActionMessage('Report period created.');
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async (reportId: number, file: File) => {
    setUploading(true);
    setUploadResult(null);
    setActionMessage('');
    try {
      const result = await api.uploadExcel(reportId, file) as any;
      setUploadResult(result);
      await fetchReports();
    } catch (err: any) {
      setActionMessage(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (reportId: number) => {
    setActionMessage('');
    try {
      const data = await api.previewReport(reportId);
      setPreviewData(data);
      setShowPreview(true);
    } catch (err: any) {
      setActionMessage(`Preview failed: ${err.message}`);
    }
  };

  const handlePublish = async (reportId: number) => {
    if (!confirm('Publish this report? It will become visible on the dashboard.')) return;
    setPublishing(true);
    setActionMessage('');
    try {
      await api.publishReport(reportId);
      setActionMessage('Report published successfully.');
      setUploadResult(null);
      await fetchReports();
    } catch (err: any) {
      setActionMessage(`Publish failed: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (reportId: number) => {
    if (!confirm('Delete this draft report?')) return;
    setActionMessage('');
    try {
      await api.deleteReport(reportId);
      setSelectedReport(null);
      setUploadResult(null);
      await fetchReports();
      setActionMessage('Report deleted.');
    } catch (err: any) {
      setActionMessage(`Delete failed: ${err.message}`);
    }
  };

  const handleArchive = async (reportId: number) => {
    if (!confirm('Archive this report?')) return;
    try {
      await api.archiveReport(reportId);
      await fetchReports();
      setActionMessage('Report archived.');
    } catch (err: any) {
      setActionMessage(`Archive failed: ${err.message}`);
    }
  };

  const handleLogout = () => {
    api.logout();
    navigate('/admin/login');
  };

  const formatDate = (d: string) => {
    if (!d) return '—';
    const dt = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'published': return 'text-[#276749] bg-[#F0FFF4]';
      case 'validated': return 'text-[#2D5A8E] bg-[#EBF4FF]';
      case 'draft': return 'text-[#B7791F] bg-[#FFFFF0]';
      case 'archived': return 'text-[#718096] bg-[#F7FAFC]';
      default: return 'text-muted-foreground bg-secondary';
    }
  };

  const selected = reports.find(r => r.id === selectedReport);

  // Preview overlay
  if (showPreview && previewData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-heading text-xl font-semibold">Report Preview</h1>
              <p className="text-sm text-muted-foreground">This is how the report will appear on the dashboard</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPreview(false)} className="text-sm border border-border rounded px-3 py-1.5 hover:bg-secondary">
                ← Back to admin
              </button>
              {selected && selected.status !== 'published' && (
                <button
                  onClick={() => { setShowPreview(false); handlePublish(selected.id); }}
                  disabled={publishing}
                  className="text-sm bg-accent text-white rounded px-3 py-1.5 hover:bg-accent/90 disabled:opacity-50"
                >
                  {publishing ? 'Publishing…' : 'Publish this report'}
                </button>
              )}
            </div>
          </div>

          {/* Render preview data as simple summary */}
          <div className="border border-border rounded bg-white p-6 space-y-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Period</p>
              <p className="font-heading text-lg font-semibold">{previewData.period_label} — {formatDate(previewData.report_date)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">KPIs</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(previewData.kpis || {}).map(([key, kpi]: [string, any]) => (
                  <div key={key} className="border border-border rounded px-3 py-2">
                    <p className="text-xs text-muted-foreground">{kpi.description}</p>
                    <p className="font-heading text-xl font-semibold">{kpi.display}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Disciplines</p>
              <div className="space-y-2">
                {(previewData.disciplines || []).map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{d.name}</span>
                    <span className="font-medium">{d.progress_pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Activities ({(previewData.activities || []).length} total)</p>
              <div className="overflow-x-auto border border-border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">WBS</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Activity</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Disc.</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Progress</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(previewData.activities || []).map((a: any) => (
                      <tr key={a.wbs}>
                        <td className="px-3 py-1.5 font-medium">{a.wbs}</td>
                        <td className="px-3 py-1.5 truncate max-w-[250px]" title={a.name}>{a.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{a.discipline}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{a.progress_pct}%</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl md:text-2xl font-semibold text-foreground">Report Management</h1>
            <p className="text-xs text-muted-foreground mt-0.5">MWL Project Dashboard — Admin</p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/" className="text-xs text-accent hover:underline">View dashboard</a>
            <button onClick={handleLogout} className="text-xs text-muted-foreground hover:underline">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Action message */}
        {actionMessage && (
          <div className={`mb-4 text-sm px-3 py-2 rounded border ${
            actionMessage.startsWith('Error') || actionMessage.includes('failed')
              ? 'border-destructive/20 bg-destructive/5 text-destructive'
              : 'border-accent/20 bg-accent/5 text-accent'
          }`}>
            {actionMessage}
          </div>
        )}

        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Reporting Periods
          </h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-sm bg-accent text-white rounded px-3 py-1.5 hover:bg-accent/90"
          >
            + New period
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="border border-border rounded bg-white p-4 mb-6">
            <h3 className="text-sm font-medium mb-3">Create new reporting period</h3>
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Period label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  className="w-full border border-border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="e.g. Week 2"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Report date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="w-full border border-border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="bg-accent text-white text-sm rounded px-4 py-1.5 hover:bg-accent/90 disabled:opacity-50 shrink-0"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-sm text-muted-foreground hover:underline shrink-0"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading reports…</p>
        ) : reports.length === 0 ? (
          <div className="border border-border rounded bg-white p-8 text-center">
            <p className="text-muted-foreground mb-2">No reports yet.</p>
            <p className="text-xs text-muted-foreground">Create a new reporting period to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Report list */}
            <div className="w-full md:w-72 shrink-0 space-y-1">
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedReport(r.id); setUploadResult(null); setActionMessage(''); }}
                  className={`w-full text-left px-3 py-2.5 rounded border text-sm transition-colors ${
                    selectedReport === r.id
                      ? 'border-accent/30 bg-accent/5'
                      : 'border-transparent hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{r.period_label}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusStyle(r.status)}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(r.report_date)}</p>
                </button>
              ))}
            </div>

            {/* Report detail */}
            <div className="flex-1 min-w-0">
              {!selected ? (
                <div className="border border-border rounded bg-white p-8 text-center">
                  <p className="text-muted-foreground text-sm">Select a report to manage</p>
                </div>
              ) : (
                <div className="border border-border rounded bg-white">
                  {/* Report header */}
                  <div className="px-5 py-4 border-b border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-heading text-lg font-semibold">{selected.period_label}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Report date: {formatDate(selected.report_date)} · Created by {selected.created_by_name}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${getStatusStyle(selected.status)}`}>
                        {selected.status}
                      </span>
                    </div>
                  </div>

                  {/* Workflow steps */}
                  <div className="px-5 py-4 space-y-5">
                    {/* Step 1: Download template */}
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Step 1 — Download template</h4>
                      <button
                        onClick={async () => {
                          try {
                            await api.downloadTemplate(selected.id, selected.period_label);
                          } catch (err: any) {
                            alert(err.message);
                          }
                        }}
                        className="inline-block text-sm text-accent hover:underline text-left"
                      >
                        ↓ Download Excel template
                      </button>
                      <p className="text-xs text-muted-foreground mt-1">
                        Fill columns H (Progress %), I (Status), J (Remarks) only.
                      </p>
                    </div>

                    {/* Step 2: Upload */}
                    {selected.status !== 'published' && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Step 2 — Upload completed file</h4>
                        {selected.upload_filename && (
                          <p className="text-xs text-muted-foreground mb-2">
                            Last upload: <span className="font-medium text-foreground">{selected.upload_filename}</span>
                          </p>
                        )}
                        <label className="inline-flex items-center gap-2 text-sm border border-border rounded px-3 py-1.5 cursor-pointer hover:bg-secondary/50">
                          <span>{uploading ? 'Uploading…' : '↑ Choose file and upload'}</span>
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            disabled={uploading}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(selected.id, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}

                    {/* Validation results */}
                    {uploadResult && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Step 3 — Validation results</h4>
                        <div className="border border-border rounded p-3 text-sm space-y-3">
                          <div className="flex flex-wrap gap-4">
                            <span className="text-muted-foreground">Rows: <strong className="text-foreground">{uploadResult.validation.summary.total_rows}</strong></span>
                            <span className="text-muted-foreground">Valid: <strong className="text-foreground">{uploadResult.validation.summary.valid_rows}</strong></span>
                            <span className="text-muted-foreground">Errors: <strong className={uploadResult.validation.summary.error_count > 0 ? 'text-destructive' : 'text-foreground'}>{uploadResult.validation.summary.error_count}</strong></span>
                            <span className="text-muted-foreground">Warnings: <strong className={uploadResult.validation.summary.warning_count > 0 ? 'text-[#B7791F]' : 'text-foreground'}>{uploadResult.validation.summary.warning_count}</strong></span>
                          </div>

                          {uploadResult.validation.errors.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-destructive mb-1">Errors (must fix before publishing):</p>
                              <ul className="space-y-1">
                                {uploadResult.validation.errors.map((e, i) => (
                                  <li key={i} className="text-xs text-destructive flex gap-2">
                                    <span className="shrink-0">✕</span>
                                    <span>{e.message}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {uploadResult.validation.warnings.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-[#B7791F] mb-1">Warnings (review recommended):</p>
                              <ul className="space-y-1">
                                {uploadResult.validation.warnings.map((w, i) => (
                                  <li key={i} className="text-xs text-[#B7791F] flex gap-2">
                                    <span className="shrink-0">⚠</span>
                                    <span>{w.message}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {uploadResult.activities_imported > 0 && (
                            <p className="text-xs text-[#276749]">✓ {uploadResult.activities_imported} activities imported successfully.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Step 4: Preview & Publish */}
                    {(selected.status === 'draft' || selected.status === 'validated') && selected.upload_filename && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Step 4 — Preview and publish</h4>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handlePreview(selected.id)}
                            className="text-sm border border-border rounded px-3 py-1.5 hover:bg-secondary/50"
                          >
                            Preview report
                          </button>
                          <button
                            onClick={() => handlePublish(selected.id)}
                            disabled={publishing || (uploadResult?.validation?.summary?.error_count ?? 0) > 0}
                            className="text-sm bg-accent text-white rounded px-3 py-1.5 hover:bg-accent/90 disabled:opacity-50"
                          >
                            {publishing ? 'Publishing…' : 'Publish report'}
                          </button>
                        </div>
                        {(uploadResult?.validation?.summary?.error_count ?? 0) > 0 && (
                          <p className="text-xs text-destructive mt-1">Cannot publish — fix validation errors first.</p>
                        )}
                      </div>
                    )}

                    {/* Published info */}
                    {selected.status === 'published' && (
                      <div className="border-t border-border pt-4">
                        <p className="text-xs text-[#276749]">
                          ✓ Published on {formatDate(selected.published_at || '')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">This report is now visible on the public dashboard.</p>
                      </div>
                    )}

                    {/* Danger zone */}
                    <div className="border-t border-border pt-4 flex gap-3">
                      {selected.status === 'published' && (
                        <button
                          onClick={() => handleArchive(selected.id)}
                          className="text-xs text-muted-foreground hover:text-destructive hover:underline"
                        >
                          Archive this report
                        </button>
                      )}
                      {selected.status !== 'published' && (
                        <button
                          onClick={() => handleDelete(selected.id)}
                          className="text-xs text-muted-foreground hover:text-destructive hover:underline"
                        >
                          Delete this draft
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
