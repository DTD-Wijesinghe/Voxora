import { useRef, useState } from 'react';
import { AudioCaptureError, MicrophoneAudioCapture } from './audio-capture';
import { MicrophoneError, MicrophoneManager } from './microphone';
import type { AudioChunk } from './pcm';

export function MicrophoneDevPanel() {
  const manager = useRef(new MicrophoneManager()).current;
  const [chunkCount, setChunkCount] = useState(0);
  const [lastSequence, setLastSequence] = useState<number | null>(null);
  const [lastChunkBytes, setLastChunkBytes] = useState<number | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const capture = useRef<MicrophoneAudioCapture | null>(null);
  if (capture.current === null) {
    capture.current = new MicrophoneAudioCapture(manager, (chunk: AudioChunk) => {
      setChunkCount((count) => count + 1);
      setLastSequence(chunk.sequence);
      setLastChunkBytes(chunk.pcm16.byteLength);
    });
  }
  const [status, setStatus] = useState('Stopped');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setStatus('Requesting microphone permission...');

    try {
      await capture.current?.start();
      setSampleRate(capture.current?.getDiagnostics().inputSampleRate ?? null);
      setStatus('Running');
    } catch (startError: unknown) {
      setStatus('Stopped');
      setError(
        startError instanceof MicrophoneError || startError instanceof AudioCaptureError
          ? startError.message
          : 'Unable to start the microphone.',
      );
    }
  };

  const stop = () => {
    capture.current?.stop();
    setStatus('Stopped');
    setError(null);
    setSampleRate(null);
    setLastChunkBytes(null);
  };

  const setMute = (muted: boolean) => {
    try {
      if (muted) {
        capture.current?.mute();
      } else {
        capture.current?.unmute();
      }
      setStatus(muted ? 'Muted' : 'Running');
      setError(null);
    } catch (muteError: unknown) {
      setError(
        muteError instanceof MicrophoneError
          ? muteError.message
          : 'Unable to change microphone mute state.',
      );
    }
  };

  return (
    <section aria-labelledby="microphone-dev-panel-title">
      <h2 id="microphone-dev-panel-title">Microphone development test</h2>
      <p>Status: {status}</p>
      <p>Input sample rate: {sampleRate ?? 'n/a'} Hz</p>
      <p>Captured chunks: {chunkCount}</p>
      <p>Last sequence: {lastSequence ?? 'n/a'}</p>
      <p>Last chunk bytes: {lastChunkBytes ?? 'n/a'} (expected 3200)</p>
      {error !== null && <p role="alert">{error}</p>}
      <div>
        <button type="button" onClick={start}>
          Start
        </button>
        <button type="button" onClick={() => setMute(true)}>
          Mute
        </button>
        <button type="button" onClick={() => setMute(false)}>
          Unmute
        </button>
        <button type="button" onClick={stop}>
          Stop
        </button>
      </div>
    </section>
  );
}
