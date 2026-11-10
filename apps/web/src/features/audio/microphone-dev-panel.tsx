import { useRef, useState } from 'react';
import { MicrophoneError, MicrophoneManager } from './microphone';

export function MicrophoneDevPanel() {
  const manager = useRef(new MicrophoneManager()).current;
  const [status, setStatus] = useState('Stopped');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setStatus('Requesting microphone permission...');

    try {
      await manager.start();
      setStatus('Running');
    } catch (startError: unknown) {
      setStatus('Stopped');
      setError(
        startError instanceof MicrophoneError
          ? startError.message
          : 'Unable to start the microphone.',
      );
    }
  };

  const stop = () => {
    manager.stop();
    setStatus('Stopped');
    setError(null);
  };

  const setMute = (muted: boolean) => {
    try {
      if (muted) {
        manager.mute();
      } else {
        manager.unmute();
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
