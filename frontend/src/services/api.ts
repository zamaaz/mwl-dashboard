const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // =============================================
  // Auth
  // =============================================
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: { id: number; name: string; email: string; role: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
    this.setToken(data.token);
    return data;
  }

  async getMe() {
    return this.request<{ user: { id: number; name: string; email: string; role: string } }>('/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // =============================================
  // Public Dashboard
  // =============================================
  async getLatestReport(projectId: number = 1) {
    return this.request(`/projects/${projectId}/reports/latest`);
  }

  async getPublishedReports(projectId: number = 1) {
    return this.request(`/projects/${projectId}/reports`);
  }

  async getReport(reportId: number) {
    return this.request(`/reports/${reportId}`);
  }

  async compareReports(reportIdA: number, reportIdB: number) {
    return this.request(`/reports/${reportIdA}/compare/${reportIdB}`);
  }

  // =============================================
  // Admin
  // =============================================
  async getAdminReports(projectId: number = 1) {
    return this.request(`/admin/reports?project_id=${projectId}`);
  }

  async getAdminReport(reportId: number) {
    return this.request(`/admin/reports/${reportId}`);
  }

  async createReport(data: { period_label: string; report_date: string; project_id?: number }) {
    return this.request('/admin/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadExcel(reportId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/admin/reports/${reportId}/upload`, {
      method: 'POST',
      body: formData,
    });
  }

  async getValidation(reportId: number) {
    return this.request(`/admin/reports/${reportId}/validate`);
  }

  async previewReport(reportId: number) {
    return this.request(`/admin/reports/${reportId}/preview`);
  }

  async publishReport(reportId: number) {
    return this.request(`/admin/reports/${reportId}/publish`, { method: 'POST' });
  }

  async archiveReport(reportId: number) {
    return this.request(`/admin/reports/${reportId}/archive`, { method: 'POST' });
  }

  async updateReport(reportId: number, data: Partial<{ period_label: string; report_date: string; executive_summary: string }>) {
    return this.request(`/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteReport(reportId: number) {
    return this.request(`/admin/reports/${reportId}`, { method: 'DELETE' });
  }

  async downloadTemplate(reportId: number, periodLabel: string) {
    const response = await fetch(`${API_BASE}/admin/reports/${reportId}/template`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download template');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MWL_Template_${periodLabel.replace(/\s+/g, '_')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient();
export default api;
