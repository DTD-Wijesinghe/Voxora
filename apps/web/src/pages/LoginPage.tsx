import { FormEvent, useState } from 'react';
import { BrandMark } from '../components/BrandMark';
import { login, type AuthSession } from '../lib/api';

interface LoginPageProps { onBack: () => void; onAuthenticated: (session: AuthSession) => void; }

export function LoginPage({ onBack, onAuthenticated }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try { onAuthenticated(await login({ email, password, displayName })); }
    catch { setError('The email or password is incorrect.'); }
    finally { setLoading(false); }
  }

  return <div className="form-shell"><header className="topbar"><button className="back-button" type="button" onClick={onBack} aria-label="Back to home">←</button><BrandMark /><span className="topbar__tag">Secure login</span></header><main className="login-layout"><div className="login-intro"><span className="eyebrow">Welcome back</span><h1>One place for<br /><em>every voice.</em></h1><p>Sign in to continue to your Voxora workspace.</p></div><form className="login-card" onSubmit={submit} noValidate><div className="login-card__header"><span className="card-icon">✦</span><div><h2>Sign in</h2><p>Enter your Voxora account details.</p></div></div><label className="field"><span className="field__label">Display name <span className="optional">optional</span></span><input className="field__control" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How should others see you?" maxLength={40} /></label><label className="field"><span className="field__label">Email</span><input className="field__control" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus /></label><label className="field"><span className="field__label">Password</span><input className="field__control" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary button--full" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Continue'}<span aria-hidden="true">→</span></button><p className="form-footnote">Your secure Voxora workspace will open automatically.</p></form></main></div>;
}
