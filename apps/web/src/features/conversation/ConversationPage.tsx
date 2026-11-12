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

interface ConversationPageProps { session: Session; role: 'organizer' | 'attendee'; onLeave: () => void; }
const INITIAL_DIAGNOSTICS: AudioSessionDiagnostics['playback'] = { state: 'IDLE', queuedChunks: 0, droppedChunks: 0, playedChunks: 0, expectedSequence: null };

export function ConversationPage({ session, role, onLeave }: ConversationPageProps) {
  const controller = useRef<AudioSessionController | null>(null);
  const [diagnostics, setDiagnostics] = useState<AudioSessionDiagnostics>({ state: 'IDLE', connectionState: 'CLOSED', handshakeComplete: false, sentChunks: 0, receivedChunks: 0, droppedChunks: 0, playback: INITIAL_DIAGNOSTICS, error: null });
  const hostParticipantId = `organizer-${session.id}`;
  const isHost = role === 'organizer';
  const currentParticipant = isHost ? session.participants.find((participant) => participant.id === hostParticipantId) : session.participants.at(-1);
  const participantId = currentParticipant?.id ?? session.participants[0]?.id ?? session.id;
  const [language, setLanguage] = useState(currentParticipant?.targetLanguage ?? 'en');
  const sessionMode = session.mode ?? 'mix';
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [error, setError] = useState('');

  const status: UiSessionStatus = diagnostics.state === 'ERROR' ? 'error' : diagnostics.state === 'CONNECTING' || diagnostics.state === 'AUTHENTICATING' ? 'reconnecting' : diagnostics.state === 'STOPPED' || diagnostics.state === 'IDLE' ? 'connecting' : diagnostics.state === 'MIC_MUTED' ? 'muted' : 'live';
  const listeningLanguage = isHost ? (session.sourceLanguage ?? 'si') : language;
  const websocketUrl = import.meta.env.VITE_AUDIO_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/audio`;

  useEffect(() => {
    const nextController = new AudioSessionController({
      url: websocketUrl,
      encodeChunk: encodeProposedInputAudio,
      createHandshake: () => createProposedAudioHandshake({ sessionId: session.id, participantId, targetLanguage: listeningLanguage, sourceLanguage: session.sourceLanguage ?? 'si', authentication: 'backend-required', sessionMode }),
      playback: { sampleRate: 24_000, channelCount: 1, byteOrder: 'little-endian' },
      playbackEnabled: !isHost,
      captureEnabled: isHost,
      onStateChange: setDiagnostics,
      onError: (audioError) => setError(audioError.message),
      onTranscript: (transcript) => setCaptions((current) => [...current.slice(-19), { id: crypto.randomUUID(), speakerName: transcript.direction === 'translated' ? 'Translated voice' : 'Participant', language: transcript.direction === 'translated' ? languageLabel(language) : 'Original', text: transcript.text, final: transcript.final, direction: transcript.direction }]),
    });
    controller.current = nextController;
    if (!isHost) {
      void nextController.start().catch(() => undefined);
    }
    return () => { nextController.stop(); controller.current = null; };
  }, [session.id, participantId, websocketUrl, listeningLanguage, sessionMode, isHost]);

  async function handleMicrophone() {
    if (!isHost) return;
    setError('');
    try {
      if (diagnostics.state === 'IDLE' || diagnostics.state === 'STOPPED' || diagnostics.state === 'ERROR') await controller.current?.start();
      else if (diagnostics.state === 'CAPTURING') controller.current?.muteMicrophone();
      else if (diagnostics.state === 'MIC_MUTED') controller.current?.unmuteMicrophone();
    } catch (audioError) { setError(audioError instanceof Error ? audioError.message : 'Unable to start live voice translation.'); }
  }

  async function handleListening() {
    if (isHost) return;
    setError('');
    try { await controller.current?.start(); } catch (audioError) { setError(audioError instanceof Error ? audioError.message : 'Unable to start live audio.'); }
  }

  async function handleAttendeeAudio() {
    setError('');
    try {
      if (diagnostics.playback.state === 'MUTED') {
        controller.current?.unmuteSpeaker();
      } else if (diagnostics.state === 'LISTENING') {
        controller.current?.muteSpeaker();
      } else {
        await handleListening();
      }
    } catch (audioError) { setError(audioError instanceof Error ? audioError.message : 'Unable to change live audio.'); }
  }

  async function handleLanguageChange(nextLanguage: string) { setLanguage(nextLanguage); await updateLanguage(session.id, nextLanguage); }
  const micLabel = diagnostics.state === 'CAPTURING' ? 'Mute microphone' : diagnostics.state === 'MIC_MUTED' ? 'Unmute microphone' : 'Start live translation';
  const statusHeading = status === 'reconnecting' ? 'Connecting to live translation...' : status === 'error' ? 'Voice connection needs attention' : diagnostics.state === 'IDLE' || diagnostics.state === 'STOPPED' ? (isHost ? 'Ready to speak' : 'Ready to listen') : 'You’re live';

  const attendeeAudioLabel = diagnostics.state !== 'LISTENING' ? 'Enable live audio' : diagnostics.playback.state === 'MUTED' ? 'Enable audio' : 'Mute audio';
  return <div className="conversation-shell"><header className="conversation-topbar"><BrandMark /><div className="session-chip"><span>Session</span><strong>{session.joinCode}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(session.joinCode)} aria-label="Copy session code">▣</button></div><div className="conversation-topbar__actions"><span className="mode-pill">{isHost ? 'Organizer · input only' : sessionMode === 'sinhala' ? 'සිංහල input' : 'Mix / auto-detect'}</span><SessionStatus status={status} /><button className="button button--danger button--small" type="button" onClick={() => { controller.current?.stop(); onLeave(); }}>Leave</button></div></header><main className="conversation-layout"><aside className="side-panel"><div className="side-panel__header"><span className="eyebrow">In this session</span><h1>Conversation room</h1></div><ParticipantList participants={session.participants} />{isHost ? <div className="side-panel__tip"><span>✦</span><p>Organizer mode sends your voice to attendees. Audio playback is disabled for this view.</p></div> : <><div className="side-panel__section"><div className="section-heading"><h2>Your listening language</h2></div><LanguageSelector value={language} onChange={handleLanguageChange} /></div><div className="side-panel__tip"><span>✦</span><p>{sessionMode === 'sinhala' ? 'Sinhala mode accepts Sinhala speech from the organizer. Your selected language controls the translated voice you hear.' : 'Mix mode automatically detects the organizer’s spoken language and translates it into your selected language.'}</p></div></>}</aside><section className="conversation-main"><div className="conversation-main__header"><div><span className="eyebrow">Live conversation</span><h2>{statusHeading}</h2><p className="audio-session-detail">{diagnostics.sentChunks} sent · {isHost ? 'Organizer input only' : `${diagnostics.receivedChunks} translated audio chunks`}</p></div>{isHost ? <div className="mic-control"><button className={`mic-button ${diagnostics.state === 'MIC_MUTED' ? 'mic-button--muted' : ''}`} type="button" onClick={() => void handleMicrophone()} aria-label={micLabel}>{diagnostics.state === 'MIC_MUTED' ? '◌' : '⌁'}</button><span>{diagnostics.state === 'CAPTURING' ? 'Microphone on' : diagnostics.state === 'MIC_MUTED' ? 'Microphone muted' : 'Start microphone'}</span></div> : <div className="mic-control audio-output-control"><span className="audio-output-icon" aria-hidden="true">◉</span><span>{diagnostics.state === 'LISTENING' && diagnostics.playback.state !== 'MUTED' ? 'Audio enabled · listening' : diagnostics.playback.state === 'MUTED' ? 'Audio muted' : 'Audio is ready'}</span><button className="button button--ghost button--small" type="button" onClick={() => void handleAttendeeAudio()}>{attendeeAudioLabel}</button></div>}</div>{error && <p className="form-error" role="alert">{error}{!isHost && <button className="button button--ghost button--small" type="button" onClick={() => void handleAttendeeAudio()}>Retry live audio</button>}</p>}<CaptionsPanel captions={captions} /><div className="conversation-main__footer">{isHost ? <span className="audio-hint"><span className="audio-hint__dot" /> Voice input only · attendees receive translations</span> : <span className="audio-hint"><span className="audio-hint__dot" /> Listening in <strong>{languageLabel(language)}</strong></span>}<span className="privacy-note">Noise suppression and voice playback run in your browser. Audio is processed securely and not stored by default.</span></div></section></main></div>;
}
