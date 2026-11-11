import { FormEvent, useState } from 'react';
import { BrandMark } from '../components/BrandMark';
import { login, type AuthSession } from '../lib/api';

interface LoginPageProps { onBack: () => void; onAuthenticated: (session: AuthSession) => void; }

export function LoginPage({ onBack, onAuthenticated }: LoginPageProps) {
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (role === 'user' && !displayName.trim()) { setError('Enter your display name to continue.'); return; }
    setLoading(true);
    try { onAuthenticated(await login({ role, email, password, displayName })); }
    catch { setError('The email or password is incorrect.'); }
    finally { setLoading(false); }
  }

  return <div className="form-shell"><header className="topbar"><button className="back-button" type="button" onClick={onBack} aria-label="Back to home">←</button><BrandMark /><span className="topbar__tag">Secure login</span></header><main className="login-layout"><div className="login-intro"><span className="eyebrow">Welcome back</span><h1>One place for<br /><em>every voice.</em></h1><p>Sign in to manage Voxora sessions or join as a participant.</p></div><form className="login-card" onSubmit={submit} noValidate><div className="login-switcher" role="tablist" aria-label="Login type"><button type="button" className={role === 'user' ? 'login-switcher__active' : ''} onClick={() => setRole('user')}>User login</button><button type="button" className={role === 'admin' ? 'login-switcher__active' : ''} onClick={() => setRole('admin')}>Admin login</button></div><h2>{role === 'admin' ? 'Admin workspace' : 'User workspace'}</h2><p className="login-card__hint">{role === 'admin' ? 'Use your administrator credentials to manage sessions.' : 'Use your Voxora user credentials to open your workspace.'}</p>{role === 'user' && <label className="field"><span className="field__label">Display name</span><input className="field__control" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How should others see you?" maxLength={40} autoFocus required /></label>}<label className="field"><span className="field__label">Email</span><input className="field__control" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={role === 'admin' ? 'admin@voxora.local' : 'user@voxora.local'} required /></label><label className="field"><span className="field__label">Password</span><input className="field__control" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary button--full" type="submit" disabled={loading}>{loading ? 'Signing in...' : `Continue as ${role === 'admin' ? 'admin' : 'user'}`}<span aria-hidden="true">→</span></button><p className="form-footnote">Your role determines which workspace opens after login.</p></form></main></div>;
}
