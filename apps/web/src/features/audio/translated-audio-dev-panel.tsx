import { useEffect, useRef, useState } from 'react';
import type { AudioChunk } from './pcm';
import {
  TranslatedAudioPlayback,
  TranslatedAudioPlaybackDiagnostics,
} from './translated-audio-playback';

const TEST_SAMPLE_RATE = 16_000;
const TEST_CHUNK_SAMPLES = 1_600;
const TEST_CHUNK_COUNT = 6;
const TEST_FREQUENCY = 220;
const TEST_AMPLITUDE = 0.12;

function createToneChunk(sequence: number): AudioChunk {
  const pcm16 = new ArrayBuffer(TEST_CHUNK_SAMPLES * 2);
  const view = new DataView(pcm16);
  const startSample = sequence * TEST_CHUNK_SAMPLES;

  for (let index = 0; index < TEST_CHUNK_SAMPLES; index += 1) {
    const sample = Math.sin(
      (2 * Math.PI * TEST_FREQUENCY * (startSample + index)) / TEST_SAMPLE_RATE,
    );
    view.setInt16(index * 2, Math.round(sample * TEST_AMPLITUDE * 0x7fff), true);
  }

  return { sequence, pcm16 };
}

const INITIAL_DIAGNOSTICS: TranslatedAudioPlaybackDiagnostics = {
  state: 'IDLE',
  queuedChunks: 0,
  droppedChunks: 0,
  playedChunks: 0,
  expectedSequence: null,
};

export function TranslatedAudioDevPanel() {
  const [diagnostics, setDiagnostics] =
    useState<TranslatedAudioPlaybackDiagnostics>(INITIAL_DIAGNOSTICS);
  const [error, setError] = useState<string | null>(null);
  const playback = useRef<TranslatedAudioPlayback | null>(null);

  if (playback.current === null) {
    playback.current = new TranslatedAudioPlayback({
      sampleRate: TEST_SAMPLE_RATE,
      channelCount: 1,
      byteOrder: 'little-endian',
      maxBufferedChunks: 8,
      missingSequenceWaitMs: 120,
      onStateChange: setDiagnostics,
      onError: (playbackError) => setError(playbackError.message),
    });
  }

  useEffect(() => {
    return () => {
      playback.current?.stop();
    };
  }, []);

  const playTone = async () => {
    setError(null);

    try {
      const engine = playback.current;
      if (engine === null) {
        return;
      }

      await engine.start();
      for (let sequence = 0; sequence < TEST_CHUNK_COUNT; sequence += 1) {
        engine.enqueueAudio(createToneChunk(sequence));
      }
    } catch (playbackError: unknown) {
      setError(
        playbackError instanceof Error
          ? playbackError.message
          : 'Unable to play the test tone.',
      );
    }
  };

  const mute = () => {
    playback.current?.mute();
  };

  const unmute = () => {
    playback.current?.unmute();
  };

  const interrupt = () => {
    playback.current?.interrupt();
  };

  const stop = () => {
    playback.current?.stop();
  };

  return (
    <section aria-labelledby="translated-audio-dev-panel-title">
      <h2 id="translated-audio-dev-panel-title">Translated audio playback test</h2>
      <p>State: {diagnostics.state}</p>
      <p>Queued chunks: {diagnostics.queuedChunks}</p>
      <p>Played chunks: {diagnostics.playedChunks}</p>
      <p>Dropped chunks: {diagnostics.droppedChunks}</p>
      <p>Expected sequence: {diagnostics.expectedSequence ?? 'n/a'}</p>
      {error !== null && <p role="alert">{error}</p>}
      <div>
        <button type="button" onClick={playTone}>
          Play Tone
        </button>
        <button type="button" onClick={mute}>
          Mute
        </button>
        <button type="button" onClick={unmute}>
          Unmute
        </button>
        <button type="button" onClick={interrupt}>
          Interrupt
        </button>
        <button type="button" onClick={stop}>
          Stop
        </button>
      </div>
    </section>
  );
}
