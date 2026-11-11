import { FormEvent, useState } from 'react';
import type { Session } from '@voxora/contracts';
import { BrandMark } from '../components/BrandMark';
import { LanguageSelector } from '../components/LanguageSelector';
import { createSession, joinSession } from '../lib/api';

interface JoinSessionPageProps { onBack: () => void; onJoined: (session: Session) => void; prefillCode?: string; }

export function JoinSessionPage({ onBack, onJoined, prefillCode }: JoinSessionPageProps) {
  const [joinCode, setJoinCode] = useState(prefillCode ?? '');
  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState('en');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!displayName.trim()) { setError('Enter a display name to continue.'); return; }
    if (joinCode.trim().length > 0 && joinCode.trim().length < 4) { setError('Session codes should contain at least 4 characters.'); return; }
    setIsSubmitting(true);
    try {
      const result = joinCode.trim() ? await joinSession({ joinCode: joinCode.trim(), displayName: displayName.trim(), targetLanguage: language }) : await createSession({ displayName: displayName.trim(), targetLanguage: language });
      onJoined(result.session);
    } catch { setError('We could not connect to that session. Check the code and try again.'); } finally { setIsSubmitting(false); }
  }

  return <div className="form-shell"><header className="topbar"><button className="back-button" type="button" onClick={onBack} aria-label="Back to home">←</button><BrandMark /><span className="topbar__tag">Join a conversation</span></header><main className="join-layout"><div className="join-intro"><span className="eyebrow">Your next conversation</span><h1>Bring your voice.<br /><em>We'll bridge the rest.</em></h1><p>Start a new conversation or join someone with a session code. Choose the language you want to hear.</p><div className="join-steps"><span><b>01</b> Enter your details</span><span><b>02</b> Choose your language</span><span><b>03</b> Start talking</span></div></div><form className="join-card" onSubmit={handleSubmit} noValidate><div className="join-card__header"><span className="card-icon">✦</span><div><h2>Join session</h2><p>All fields are kept private.</p></div></div><label className="field"><span className="field__label">Session code <span className="optional">optional for a new session</span></span><input className="field__control" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="e.g. VOXORA" autoComplete="off" /></label><label className="field"><span className="field__label">Display name</span><input className="field__control" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should others see you?" maxLength={40} required /></label><LanguageSelector value={language} onChange={setLanguage} disabled={isSubmitting} />{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary button--full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Connecting...' : joinCode.trim() ? 'Join conversation' : 'Create conversation'}<span aria-hidden="true">→</span></button><p className="form-footnote">By continuing, you agree to use Voxara respectfully.</p></form></main></div>;
}
