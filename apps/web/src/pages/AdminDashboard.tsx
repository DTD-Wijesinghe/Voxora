import { useEffect, useState } from 'react';
import type { AdminSession, CreateAdminSessionRequest, UpdateAdminSessionRequest } from '@voxora/contracts';
import { BrandMark } from '../components/BrandMark';

const API = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:3000`;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

interface AdminDashboardProps { onBack: () => void; authToken: string; onLogout: () => void; }

export function AdminDashboard({ onBack, authToken, onLogout }: AdminDashboardProps) {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateAdminSessionRequest>({ title: '', participantLimit: 10, expiresInMinutes: 60 });
  const [editForm, setEditForm] = useState<UpdateAdminSessionRequest>({});
  const [error, setError] = useState('');

  async function load() {
    try { setSessions(await apiFetch<AdminSession[]>('/api/admin/sessions', { headers: { Authorization: `Bearer ${authToken}` } })); } catch { setError('Your admin session has expired. Please sign in again.'); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/admin/sessions', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: JSON.stringify(form) });
      setForm({ title: '', participantLimit: 10, expiresInMinutes: 60 });
      setCreating(false);
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function handleUpdate(id: string) {
    try {
      await apiFetch(`/api/admin/sessions/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${authToken}` }, body: JSON.stringify(editForm) });
      setEditId(null);
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this session?')) return;
    await apiFetch(`/api/admin/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } });
    load();
  }

  return (
    <div className="admin-shell">
      <header className="topbar">
        <button className="back-button" type="button" onClick={onBack} aria-label="Back">←</button>
        <BrandMark />
        <span className="topbar__tag">Admin Dashboard</span>
        <div className="topbar__action admin-header-actions"><button className="button button--primary button--small" type="button" onClick={() => setCreating(true)}>+ New Session</button><button className="button button--ghost button--small" type="button" onClick={onLogout}>Sign out</button></div>
      </header>

      <main className="admin-main">
        {error && <p className="form-error" role="alert">{error}</p>}

        {creating && (
          <form className="admin-create-form" onSubmit={handleCreate}>
            <h2>Create Session</h2>
            <label className="field"><span className="field__label">Title</span>
              <input className="field__control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Team Meeting" />
            </label>
            <label className="field"><span className="field__label">Participant Limit</span>
              <input className="field__control" type="number" min={1} max={500} value={form.participantLimit} onChange={e => setForm(f => ({ ...f, participantLimit: Number(e.target.value) }))} required />
            </label>
            <label className="field"><span className="field__label">Expires In (minutes)</span>
              <input className="field__control" type="number" min={5} max={1440} value={form.expiresInMinutes} onChange={e => setForm(f => ({ ...f, expiresInMinutes: Number(e.target.value) }))} />
            </label>
            <div className="admin-form-actions">
              <button className="button button--primary" type="submit">Create</button>
              <button className="button button--ghost" type="button" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="admin-sessions-grid">
          {sessions.length === 0 && <p className="admin-empty">No sessions yet. Create one above.</p>}
          {sessions.map(s => (
            <div key={s.id} className="admin-session-card">
              <div className="admin-session-card__qr">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(s.qrUrl)}&size=160x160`} alt={`QR for ${s.title}`} width={160} height={160} />
              </div>
              <div className="admin-session-card__info">
                {editId === s.id ? (
                  <div className="admin-edit-form">
                    <input className="field__control" defaultValue={s.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" />
                    <input className="field__control" type="number" defaultValue={s.participantLimit} onChange={e => setEditForm(f => ({ ...f, participantLimit: Number(e.target.value) }))} placeholder="Limit" />
                    <div className="admin-form-actions">
                      <button className="button button--primary button--small" type="button" onClick={() => handleUpdate(s.id)}>Save</button>
                      <button className="button button--ghost button--small" type="button" onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3>{s.title}</h3>
                    <p className="admin-session-meta"><strong>Code:</strong> <code>{s.joinCode}</code></p>
                    <p className="admin-session-meta"><strong>Status:</strong> <span className={`status-badge status-badge--${s.status}`}>{s.status}</span></p>
                    <p className="admin-session-meta"><strong>Participants:</strong> {s.participants.length} / {s.participantLimit}</p>
                    <p className="admin-session-meta"><strong>Expires:</strong> {new Date(s.expiresAt).toLocaleString()}</p>
                    <p className="admin-session-meta admin-session-url"><strong>Join URL:</strong> <a href={s.qrUrl} target="_blank" rel="noreferrer">{s.qrUrl}</a></p>
                    <div className="admin-form-actions">
                      <button className="button button--ghost button--small" type="button" onClick={() => { setEditId(s.id); setEditForm({ title: s.title, participantLimit: s.participantLimit }); }}>Edit</button>
                      <button className="button button--danger button--small" type="button" onClick={() => handleDelete(s.id)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
