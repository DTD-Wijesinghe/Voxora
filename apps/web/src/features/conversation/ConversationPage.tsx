import { useMemo, useState } from 'react';
import type { Session } from '@voxora/contracts';
import { BrandMark } from '../../components/BrandMark';
import { CaptionsPanel } from '../../components/CaptionsPanel';
import { LanguageSelector } from '../../components/LanguageSelector';
import { ParticipantList } from '../../components/ParticipantList';
import { SessionStatus } from '../../components/SessionStatus';
import { languageLabel } from '../../lib/languages';
import { updateLanguage } from '../../lib/api';
import type { Caption, UiSessionStatus } from '../../types';

interface ConversationPageProps { session: Session; onLeave: () => void; }
const sampleCaptions: Caption[] = [{ id: 'welcome', speakerName: 'Voxora', language: 'System', text: 'Your conversation is ready. Start speaking when you are ready.', final: true, direction: 'translated' }];

export function ConversationPage({ session, onLeave }: ConversationPageProps) {
  const [status, setStatus] = useState<UiSessionStatus>('live');
  const [isMuted, setIsMuted] = useState(false);
  const [language, setLanguage] = useState(session.participants[0]?.targetLanguage ?? 'en');
  const [captions] = useState(sampleCaptions);
  const statusLabel = useMemo(() => isMuted ? 'muted' : status, [isMuted, status]);

  async function handleLanguageChange(nextLanguage: string) {
    setLanguage(nextLanguage);
    await updateLanguage(session.id, nextLanguage);
  }

  return <div className="conversation-shell"><header className="conversation-topbar"><BrandMark /><div className="session-chip"><span>Session</span><strong>{session.joinCode}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(session.joinCode)} aria-label="Copy session code">▣</button></div><div className="conversation-topbar__actions"><SessionStatus status={statusLabel} /><button className="button button--ghost button--small" type="button" onClick={() => setStatus(status === 'reconnecting' ? 'live' : 'reconnecting')}>{status === 'reconnecting' ? 'Retry connection' : 'Simulate reconnect'}</button><button className="button button--danger button--small" type="button" onClick={() => { setStatus('ended'); onLeave(); }}>Leave</button></div></header><main className="conversation-layout"><aside className="side-panel"><div className="side-panel__header"><span className="eyebrow">In this session</span><h1>Conversation room</h1></div><ParticipantList participants={session.participants} /><div className="side-panel__section"><div className="section-heading"><h2>Your language</h2></div><LanguageSelector value={language} onChange={handleLanguageChange} /></div><div className="side-panel__tip"><span>✦</span><p>Speak naturally. Voxora will translate your voice for the other participant.</p></div></aside><section className="conversation-main"><div className="conversation-main__header"><div><span className="eyebrow">Live conversation</span><h2>{status === 'reconnecting' ? 'Restoring your connection...' : status === 'error' ? 'Something went wrong' : 'You’re ready to talk'}</h2></div><div className="mic-control"><button className={`mic-button ${isMuted ? 'mic-button--muted' : ''}`} type="button" onClick={() => setIsMuted((value) => !value)} aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}>{isMuted ? '◌' : '⌁'}</button><span>{isMuted ? 'Microphone muted' : 'Microphone on'}</span></div></div><CaptionsPanel captions={captions} /><div className="conversation-main__footer"><span className="audio-hint"><span className="audio-hint__dot" /> Listening in <strong>{languageLabel(language)}</strong></span><span className="privacy-note">Audio is processed securely and not stored by default.</span></div></section></main></div>;
}

