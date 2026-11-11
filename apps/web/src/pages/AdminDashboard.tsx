import { useEffect, useState } from 'react';
import type { AdminSession, CreateAdminSessionRequest, UpdateAdminSessionRequest, SessionMode } from '@voxora/contracts';
import { BrandMark } from '../components/BrandMark';

const API = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return undefined as T;
  return r.json();
}

interface AdminDashboardProps { onBack: () => void; authToken: string; onLogout: () => void; onOpenSession: (session: AdminSession) => void; }

export function AdminDashboard({ onBack, authToken, onLogout, onOpenSession }: AdminDashboardProps) {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateAdminSessionRequest>({ title: '', participantLimit: 10, expiresInMinutes: 60, mode: 'mix', sourceLanguage: 'si' });
  const [editForm, setEditForm] = useState<UpdateAdminSessionRequest>({});
  const [error, setError] = useState('');

  async function load() {
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const nextSessions = await apiFetch<AdminSession[]>('/api/admin/sessions', { headers });
      setSessions(nextSessions);
    } catch { setError('Your admin session has expired. Please sign in again.'); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/admin/sessions', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: JSON.stringify(form) });
      setForm({ title: '', participantLimit: 10, expiresInMinutes: 60, mode: 'mix', sourceLanguage: 'si' });
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
    try {
      setError('');
      await apiFetch(`/api/admin/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } });
      await load();
    } catch (err: any) { setError(err.message || 'Unable to delete the session.'); }
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
        <section className="admin-hero">
          <div>
            <span className="eyebrow">Control centre</span>
            <h1>Run every conversation with confidence.</h1>
            <p>Create secure rooms, share the QR code, and monitor participation from one focused workspace.</p>
          </div>
          <div className="admin-hero__mark" aria-hidden="true">⌁</div>
        </section>
        <section className="admin-stats" aria-label="Session summary">
          <article><span>Active rooms</span><strong>{sessions.filter((session) => session.status === 'live' || session.status === 'connecting').length}</strong><small>Ready for participants</small></article>
          <article><span>Total rooms</span><strong>{sessions.length}</strong><small>Managed from this account</small></article>
          <article><span>Participants</span><strong>{sessions.reduce((total, session) => total + session.participants.length, 0)}</strong><small>Across all rooms</small></article>
        </section>
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
            <label className="field"><span className="field__label">Voice input mode</span>
              <select className="field__control" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value as SessionMode }))}><option value="mix">Mix mode — detect the organizer’s spoken language</option><option value="sinhala">Sinhala mode — accept Sinhala speech only</option></select>
            </label>
            <label className="field"><span className="field__label">Organizer input language</span>
              <select className="field__control" value={form.sourceLanguage} disabled={form.mode === 'mix'} onChange={e => setForm(f => ({ ...f, sourceLanguage: e.target.value }))}><option value="si">Sinhala</option><option value="en">English</option></select>
              <span className="field__help">Sinhala mode uses this as the required organizer input language. Mix mode detects the spoken language automatically.</span>
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
                    <p className="admin-session-meta"><strong>Mode:</strong> {s.mode === 'sinhala' ? 'Sinhala only' : 'Mix / auto-detect'}</p>
                    <p className="admin-session-meta"><strong>Organizer input:</strong> {s.mode === 'mix' ? 'Automatically detected' : s.sourceLanguage === 'si' ? 'Sinhala' : 'English'}</p>
                    <p className="admin-session-meta"><strong>Attendees:</strong> {s.participants.filter((participant) => !participant.isHost).length} / {s.participantLimit}</p>
                    <div className="admin-participants" aria-label={`Participants in ${s.title}`}><strong>Joined now</strong>{s.participants.map((participant) => <span key={participant.id} className="admin-participant">{participant.displayName}{participant.isHost ? ' · organizer' : ` · ${participant.targetLanguage}`}</span>)}</div>
                    <p className="admin-session-meta"><strong>Expires:</strong> {new Date(s.expiresAt).toLocaleString()}</p>
                    <p className="admin-session-meta admin-session-url"><strong>Join URL:</strong> <a href={s.qrUrl} target="_blank" rel="noreferrer">{s.qrUrl}</a></p>
                    <div className="admin-form-actions">
                      <button className="button button--primary button--small" type="button" onClick={() => onOpenSession(s)}>Open live room</button>
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
