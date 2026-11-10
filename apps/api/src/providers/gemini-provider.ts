import { existsSync } from 'node:fs';
import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveConnectParameters, LiveServerMessage, Session } from '@google/genai';
import type { TranslationEvent, TranslationProvider } from '@voxora/contracts';
import { TranslationProviderError } from './errors.js';
import type { ProviderErrorCode } from './errors.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-live-translate-preview';
export const INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';

const BCP47_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export type LiveSession = Pick<Session, 'sendRealtimeInput' | 'close'>;
export type LiveConnect = (params: LiveConnectParameters) => Promise<LiveSession>;

export interface GeminiProviderOptions {
  model?: string;
  connectTimeoutMs?: number;
  /** Injected for tests; defaults to the real Gemini Live connection. */
  connect: LiveConnect;
}

/** Builds Gemini options from environment variables. Throws on invalid configuration. */
export function readGeminiOptions(env: NodeJS.ProcessEnv): GeminiProviderOptions {
  const auth = env.GEMINI_AUTH ?? 'vertex';
  let client: GoogleGenAI;

  if (auth === 'vertex') {
    const project = env.GCP_PROJECT;
    const credentials = env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!project || project === 'replace_me') {
      throw configError('GCP_PROJECT must be set when GEMINI_AUTH=vertex.');
    }
    if (!credentials || !existsSync(credentials)) {
      throw configError('GOOGLE_APPLICATION_CREDENTIALS must point to an existing service-account file.');
    }
    client = new GoogleGenAI({ vertexai: true, project, location: env.GCP_LOCATION ?? 'global' });
  } else if (auth === 'api-key') {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'replace_me') {
      throw configError('GEMINI_API_KEY must be set when GEMINI_AUTH=api-key.');
    }
    client = new GoogleGenAI({ apiKey });
  } else {
    throw configError(`Unknown GEMINI_AUTH "${auth}". Use "vertex" or "api-key".`);
  }

  return {
    model: env.GEMINI_LIVE_MODEL ?? DEFAULT_GEMINI_MODEL,
    connectTimeoutMs: Number(env.GEMINI_CONNECT_TIMEOUT_MS ?? 10_000),
    connect: (params) => client.live.connect(params),
  };
}

/**
 * Gemini Live Translate adapter. One provider session translates one speaker's
 * audio into one target language; open a second session for the reverse direction.
 */
export function createGeminiTranslationProvider(options: GeminiProviderOptions): TranslationProvider {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;

  return {
    async start({ targetLanguage, onEvent }) {
      if (!BCP47_PATTERN.test(targetLanguage)) {
        throw new TranslationProviderError(
          'UNSUPPORTED_LANGUAGE',
          `"${targetLanguage}" is not a valid language code.`,
        );
      }

      let closedByUs = false;
      let outputSequence = 0;

      function handleMessage(message: LiveServerMessage): void {
        if (message.setupComplete) onEvent({ type: 'status', status: 'live' });

        const content = message.serverContent;
        if (!content) return;

        if (content.inputTranscription?.text) {
          onEvent({
            type: 'input_transcript',
            text: content.inputTranscription.text,
            final: content.inputTranscription.finished ?? false,
          });
        }
        if (content.outputTranscription?.text) {
          onEvent({
            type: 'output_transcript',
            text: content.outputTranscription.text,
            final: content.outputTranscription.finished ?? false,
          });
        }
        for (const part of content.modelTurn?.parts ?? []) {
          const data = part.inlineData?.data;
          if (data) onEvent({ type: 'audio', pcm16: base64ToArrayBuffer(data), sequence: outputSequence++ });
        }
      }

      const connection = options.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          translationConfig: { targetLanguageCode: targetLanguage },
        },
        callbacks: {
          onmessage: handleMessage,
          onerror: () => {
            onEvent(errorEvent('PROVIDER_UNAVAILABLE'));
          },
          onclose: (event) => {
            if (!closedByUs) onEvent(errorEvent(codeFromClose(event.code, event.reason)));
            onEvent({ type: 'status', status: 'ended' });
          },
        },
      });

      let session: LiveSession;
      try {
        session = await withTimeout(connection, connectTimeoutMs);
      } catch (error) {
        throw toProviderError(error);
      }

      return {
        async sendAudio(pcm16) {
          if (closedByUs) {
            throw new TranslationProviderError(
              'PROVIDER_SESSION_CLOSED',
              'Cannot send audio after the translation session has closed.',
            );
          }
          session.sendRealtimeInput({
            audio: { data: Buffer.from(pcm16).toString('base64'), mimeType: INPUT_AUDIO_MIME_TYPE },
          });
        },

        async close() {
          if (closedByUs) return;
          closedByUs = true;
          session.close();
        },
      };
    },
  };
}

const userMessages: Record<ProviderErrorCode, string> = {
  PROVIDER_CONFIG_INVALID: 'The translation service is not configured correctly.',
  PROVIDER_UNAVAILABLE: 'The translation service is temporarily unavailable.',
  PROVIDER_RATE_LIMITED: 'The translation service is busy. Please try again shortly.',
  PROVIDER_TIMEOUT: 'The translation service took too long to respond.',
  PROVIDER_SESSION_CLOSED: 'The translation session has ended.',
  UNSUPPORTED_LANGUAGE: 'That language is not supported for translation.',
};

function errorEvent(code: ProviderErrorCode): TranslationEvent {
  return { type: 'error', code, message: userMessages[code] };
}

function configError(message: string): TranslationProviderError {
  return new TranslationProviderError('PROVIDER_CONFIG_INVALID', message);
}

/** Maps a provider failure to a stable code without exposing the raw provider message. */
function codeFromText(text: string): ProviderErrorCode {
  if (/quota|rate|RESOURCE_EXHAUSTED|429/i.test(text)) return 'PROVIDER_RATE_LIMITED';
  if (/language/i.test(text) && /unsupported|invalid|not supported/i.test(text)) return 'UNSUPPORTED_LANGUAGE';
  if (/permission|PERMISSION_DENIED|unauthenticated|credential|not found|NOT_FOUND|40[134]/i.test(text)) {
    return 'PROVIDER_CONFIG_INVALID';
  }
  return 'PROVIDER_UNAVAILABLE';
}

function codeFromClose(code: number, reason: string): ProviderErrorCode {
  if (code === 1008) return reason ? codeFromText(reason) : 'PROVIDER_CONFIG_INVALID';
  return codeFromText(reason);
}

function toProviderError(error: unknown): TranslationProviderError {
  if (error instanceof TranslationProviderError) return error;
  const code = codeFromText(error instanceof Error ? error.message : String(error));
  return new TranslationProviderError(code, userMessages[code]);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TranslationProviderError('PROVIDER_TIMEOUT', userMessages.PROVIDER_TIMEOUT)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function base64ToArrayBuffer(data: string): ArrayBuffer {
  const bytes = Buffer.from(data, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
