import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@voxora/contracts';
import { BrandMark } from '../../components/BrandMark';
import { CaptionsPanel } from '../../components/CaptionsPanel';
import { LanguageSelector } from '../../components/LanguageSelector';
import { ParticipantList } from '../../components/ParticipantList';
import { SessionStatus } from '../../components/SessionStatus';
import { languageLabel } from '../../lib/languages';
import { updateLanguage } from '../../lib/api';
import { AudioSessionController, type AudioSessionDiagnostics } from '../audio/audio-session-controller';
import { createProposedAudioHandshake, encodeProposedInputAudio } from '../audio/audio-session-protocol-v1';
import type { Caption, UiSessionStatus } from '../../types';

interface ConversationPageProps { session: Session; onLeave: () => void; }
const INITIAL_DIAGNOSTICS: AudioSessionDiagnostics['playback'] = { state: 'IDLE', queuedChunks: 0, droppedChunks: 0, playedChunks: 0, expectedSequence: null };

export function ConversationPage({ session, onLeave }: ConversationPageProps) {
  const controller = useRef<AudioSessionController | null>(null);
  const [diagnostics, setDiagnostics] = useState<AudioSessionDiagnostics>({ state: 'IDLE', connectionState: 'CLOSED', handshakeComplete: false, sentChunks: 0, receivedChunks: 0, droppedChunks: 0, playback: INITIAL_DIAGNOSTICS, error: null });
  const [language, setLanguage] = useState(session.participants.at(-1)?.targetLanguage ?? 'en');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [error, setError] = useState('');

  const status: UiSessionStatus = diagnostics.state === 'ERROR' ? 'error' : diagnostics.state === 'CONNECTING' || diagnostics.state === 'AUTHENTICATING' ? 'reconnecting' : diagnostics.state === 'STOPPED' || diagnostics.state === 'IDLE' ? 'connecting' : diagnostics.state === 'MIC_MUTED' ? 'muted' : 'live';
  const participantId = session.participants.at(-1)?.id ?? session.participants[0]?.id ?? session.id;
  const websocketUrl = import.meta.env.VITE_AUDIO_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/audio`;

  useEffect(() => {
    const nextController = new AudioSessionController({
      url: websocketUrl,
      encodeChunk: encodeProposedInputAudio,
      createHandshake: () => createProposedAudioHandshake({ sessionId: session.id, participantId, targetLanguage: language, authentication: 'backend-required' }),
      playback: { sampleRate: 24_000, channelCount: 1, byteOrder: 'little-endian' },
      onStateChange: setDiagnostics,
      onError: (audioError) => setError(audioError.message),
      onTranscript: (transcript) => setCaptions((current) => [...current.slice(-19), { id: crypto.randomUUID(), speakerName: transcript.direction === 'translated' ? 'Translated voice' : 'Participant', language: transcript.direction === 'translated' ? languageLabel(language) : 'Original', text: transcript.text, final: transcript.final, direction: transcript.direction }]),
    });
    controller.current = nextController;
    return () => { nextController.stop(); controller.current = null; };
  }, [session.id, participantId, websocketUrl, language]);

  async function handleMicrophone() {
    setError('');
    try {
      if (diagnostics.state === 'IDLE' || diagnostics.state === 'STOPPED' || diagnostics.state === 'ERROR') await controller.current?.start();
      else if (diagnostics.state === 'CAPTURING') controller.current?.muteMicrophone();
      else if (diagnostics.state === 'MIC_MUTED') controller.current?.unmuteMicrophone();
    } catch (audioError) { setError(audioError instanceof Error ? audioError.message : 'Unable to start live voice translation.'); }
  }

  async function handleLanguageChange(nextLanguage: string) { setLanguage(nextLanguage); await updateLanguage(session.id, nextLanguage); }
  const micLabel = diagnostics.state === 'CAPTURING' ? 'Mute microphone' : diagnostics.state === 'MIC_MUTED' ? 'Unmute microphone' : 'Start live translation';
  const statusHeading = status === 'reconnecting' ? 'Connecting to live translation...' : status === 'error' ? 'Voice connection needs attention' : diagnostics.state === 'IDLE' || diagnostics.state === 'STOPPED' ? 'Ready for live translation' : 'You’re live';

  return <div className="conversation-shell"><header className="conversation-topbar"><BrandMark /><div className="session-chip"><span>Session</span><strong>{session.joinCode}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(session.joinCode)} aria-label="Copy session code">▣</button></div><div className="conversation-topbar__actions"><SessionStatus status={status} /><button className="button button--danger button--small" type="button" onClick={() => { controller.current?.stop(); onLeave(); }}>Leave</button></div></header><main className="conversation-layout"><aside className="side-panel"><div className="side-panel__header"><span className="eyebrow">In this session</span><h1>Conversation room</h1></div><ParticipantList participants={session.participants} /><div className="side-panel__section"><div className="section-heading"><h2>Your language</h2></div><LanguageSelector value={language} onChange={handleLanguageChange} /></div><div className="side-panel__tip"><span>✦</span><p>Start your microphone to send speech to the other participants. Their voices are translated into your selected language.</p></div></aside><section className="conversation-main"><div className="conversation-main__header"><div><span className="eyebrow">Live conversation</span><h2>{statusHeading}</h2><p className="audio-session-detail">{diagnostics.sentChunks} sent · {diagnostics.receivedChunks} translated audio chunks</p></div><div className="mic-control"><button className={`mic-button ${diagnostics.state === 'MIC_MUTED' ? 'mic-button--muted' : ''}`} type="button" onClick={() => void handleMicrophone()} aria-label={micLabel}>{diagnostics.state === 'MIC_MUTED' ? '◌' : '⌁'}</button><span>{diagnostics.state === 'CAPTURING' ? 'Microphone on' : diagnostics.state === 'MIC_MUTED' ? 'Microphone muted' : 'Start microphone'}</span></div></div>{error && <p className="form-error" role="alert">{error}</p>}<CaptionsPanel captions={captions} /><div className="conversation-main__footer"><span className="audio-hint"><span className="audio-hint__dot" /> Listening in <strong>{languageLabel(language)}</strong></span><span className="privacy-note">Audio is processed securely and not stored by default.</span></div></section></main></div>;
}
