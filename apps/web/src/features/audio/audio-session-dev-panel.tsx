import { useEffect, useRef, useState } from 'react';
import {
  AudioSessionController,
  AudioSessionDiagnostics,
} from './audio-session-controller';
import { createProposedAudioHandshake, encodeProposedInputAudio } from './audio-session-protocol-v1';
import { createMockAudioWebSocketFactory } from './mock-audio-websocket';

const INITIAL_DIAGNOSTICS: AudioSessionDiagnostics = {
  state: 'IDLE',
  connectionState: 'CLOSED',
  handshakeComplete: false,
  sentChunks: 0,
  receivedChunks: 0,
  droppedChunks: 0,
  playback: {
    state: 'IDLE',
    queuedChunks: 0,
    droppedChunks: 0,
    playedChunks: 0,
    expectedSequence: null,
  },
  error: null,
};

export function AudioSessionDevPanel() {
  const [diagnostics, setDiagnostics] =
    useState<AudioSessionDiagnostics>(INITIAL_DIAGNOSTICS);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AudioSessionController | null>(null);

  if (controller.current === null) {
    controller.current = new AudioSessionController({
      url: 'mock://voxora-audio-v1',
      encodeChunk: encodeProposedInputAudio,
      createHandshake: () =>
        createProposedAudioHandshake({
          sessionId: 'mock-only-session',
          participantId: 'mock-only-participant',
          authentication: 'backend-required',
        }),
      webSocketFactory: createMockAudioWebSocketFactory(),
      playback: {
        sampleRate: 16_000,
        channelCount: 1,
        byteOrder: 'little-endian',
      },
      onStateChange: setDiagnostics,
      onError: (sessionError) => setError(sessionError.message),
    });
  }

  useEffect(() => {
    return () => controller.current?.stop();
  }, []);

  const start = async () => {
    setError(null);
    try {
      await controller.current?.start();
    } catch (sessionError: unknown) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : 'Unable to start the mock audio session.',
      );
    }
  };

  return (
    <section aria-labelledby="audio-session-dev-panel-title">
      <h2 id="audio-session-dev-panel-title">Mock audio session test</h2>
      <p>Connection: {diagnostics.connectionState}</p>
      <p>Session: {diagnostics.state}</p>
      <p>Handshake: {diagnostics.handshakeComplete ? 'complete' : 'pending'}</p>
      <p>Sent chunks: {diagnostics.sentChunks}</p>
      <p>Received chunks: {diagnostics.receivedChunks}</p>
      <p>Dropped chunks: {diagnostics.droppedChunks}</p>
      <p>Playback: {diagnostics.playback.state}</p>
      <p>Playback queued: {diagnostics.playback.queuedChunks}</p>
      <p>Playback played: {diagnostics.playback.playedChunks}</p>
      {error !== null && <p role="alert">{error}</p>}
      <div>
        <button type="button" onClick={start}>
          Start Mock Session
        </button>
        <button type="button" onClick={() => controller.current?.muteMicrophone()}>
          Mute Microphone
        </button>
        <button type="button" onClick={() => controller.current?.unmuteMicrophone()}>
          Unmute Microphone
        </button>
        <button type="button" onClick={() => controller.current?.muteSpeaker()}>
          Mute Speaker
        </button>
        <button type="button" onClick={() => controller.current?.unmuteSpeaker()}>
          Unmute Speaker
        </button>
        <button type="button" onClick={() => controller.current?.interruptSpeaker()}>
          Interrupt Speaker
        </button>
        <button type="button" onClick={() => controller.current?.stop()}>
          Stop Session
        </button>
      </div>
    </section>
  );
}
