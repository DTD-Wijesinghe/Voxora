import type { TranslationEvent, TranslationProvider } from '@voxora/contracts';
import { TranslationProviderError } from './errors.js';

export interface MockProviderOptions {
  /** Delay before each echoed audio chunk is emitted. */
  delayMs?: number;
  /** Number of audio chunks that make up one fake spoken phrase. */
  chunksPerPhrase?: number;
}

/**
 * Provider that behaves like a live translation service without calling one.
 * It echoes received audio back as "translated" audio and emits a pair of
 * fake transcripts after every phrase, so other modules can integrate
 * before the Gemini adapter is ready.
 */
export function createMockTranslationProvider(
  options: MockProviderOptions = {},
): TranslationProvider {
  const delayMs = options.delayMs ?? 200;
  const chunksPerPhrase = options.chunksPerPhrase ?? 10;

  return {
    async start({ targetLanguage, onEvent }) {
      const timers = new Set<ReturnType<typeof setTimeout>>();
      let closed = false;
      let receivedChunks = 0;
      let outputSequence = 0;
      let phrase = 0;

      function emitLater(event: TranslationEvent): void {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!closed) onEvent(event);
        }, delayMs);
        timers.add(timer);
      }

      onEvent({ type: 'status', status: 'live' });

      return {
        async sendAudio(pcm16) {
          if (closed) {
            throw new TranslationProviderError(
              'PROVIDER_SESSION_CLOSED',
              'Cannot send audio after the translation session has closed.',
            );
          }

          receivedChunks += 1;
          emitLater({ type: 'audio', pcm16: pcm16.slice(0), sequence: outputSequence++ });

          if (receivedChunks % chunksPerPhrase === 0) {
            phrase += 1;
            emitLater({ type: 'input_transcript', text: `Mock phrase ${phrase}`, final: true });
            emitLater({
              type: 'output_transcript',
              text: `[${targetLanguage}] Mock translation ${phrase}`,
              final: true,
            });
          }
        },

        async close() {
          if (closed) return;
          closed = true;
          for (const timer of timers) clearTimeout(timer);
          timers.clear();
          onEvent({ type: 'status', status: 'ended' });
        },
      };
    },
  };
}
