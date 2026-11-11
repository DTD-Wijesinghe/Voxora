import { FormEvent, useState } from 'react';
import { BrandMark } from '../components/BrandMark';
import { login, register, type AuthSession } from '../lib/api';

interface LoginPageProps { onBack: () => void; onAuthenticated: (session: AuthSession) => void; }

export function LoginPage({ onBack, onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && !displayName.trim()) { setError('Enter your display name to continue.'); return; }
    if (mode === 'register' && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try { onAuthenticated(mode === 'register' ? await register({ email, password, displayName }) : await login({ email, password, displayName })); }
    catch { setError(mode === 'register' ? 'We could not create this account.' : 'The email or password is incorrect.'); }
    finally { setLoading(false); }
  }

  const isRegistering = mode === 'register';
  return <div className="form-shell"><header className="topbar"><button className="back-button" type="button" onClick={onBack} aria-label="Back to home">←</button><BrandMark /><span className="topbar__tag">Secure account</span></header><main className="login-layout"><div className="login-intro"><span className="eyebrow">{isRegistering ? 'Get started' : 'Welcome back'}</span><h1>{isRegistering ? <>Create your<br /><em>Voxora account.</em></> : <>One place for<br /><em>every voice.</em></>}</h1><p>{isRegistering ? 'Create an account to join live translated conversations.' : 'Sign in to continue to your Voxora workspace.'}</p></div><form className="login-card" onSubmit={submit} noValidate><div className="login-mode-switcher" role="tablist" aria-label="Account access"><button type="button" className={mode === 'login' ? 'login-mode-switcher__active' : ''} onClick={() => { setMode('login'); setError(''); }}>Login</button><button type="button" className={mode === 'register' ? 'login-mode-switcher__active' : ''} onClick={() => { setMode('register'); setError(''); }}>Register</button></div><div className="login-card__header"><span className="card-icon">✦</span><div><h2>{isRegistering ? 'Create account' : 'Sign in'}</h2><p>{isRegistering ? 'Your account is ready for live conversations.' : 'Enter your Voxora account details.'}</p></div></div>{isRegistering && <label className="field"><span className="field__label">Display name</span><input className="field__control" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How should others see you?" maxLength={40} required autoFocus /></label>}<label className="field"><span className="field__label">Email</span><input className="field__control" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus={!isRegistering} /></label><label className="field"><span className="field__label">Password</span><input className="field__control" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isRegistering ? 'At least 8 characters' : 'Enter your password'} minLength={isRegistering ? 8 : undefined} required /></label>{isRegistering && <label className="field"><span className="field__label">Confirm password</span><input className="field__control" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" minLength={8} required /></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary button--full" type="submit" disabled={loading}>{loading ? (isRegistering ? 'Creating account...' : 'Signing in...') : isRegistering ? 'Create account' : 'Continue'}<span aria-hidden="true">→</span></button><p className="form-footnote">Your secure Voxora workspace will open automatically.</p></form></main></div>;
}
