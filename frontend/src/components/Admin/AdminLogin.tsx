import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.login(email, password);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="font-heading text-2xl font-semibold text-foreground">Admin Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage project reports</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive border border-destructive/20 rounded px-3 py-2 bg-destructive/5">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="admin"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-white text-sm font-medium rounded px-4 py-2 hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-muted-foreground mt-6 text-center">
          <a href="/" className="hover:underline">← Back to dashboard</a>
        </p>
      </div>
    </div>
  );
};
