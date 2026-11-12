import { existsSync } from 'node:fs';
import { EndSensitivity, GoogleGenAI, Modality, StartSensitivity } from '@google/genai';
import type { LiveConnectParameters, LiveServerMessage, Session } from '@google/genai';
import type { TranslationEvent, TranslationProvider } from '@voxora/contracts';
import { TranslationProviderError } from './errors.js';
import type { ProviderErrorCode } from './errors.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-live-translate-preview';
export const INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';
/** Gemini's documented output rate, used when a chunk's MIME type omits it. */
export const OUTPUT_SAMPLE_RATE = 24_000;

const BCP47_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
// The translate model never marks transcripts finished, so a sentence end closes a caption line.
const SENTENCE_END = /[.!?。？！]["'”’)]?\s*$/;

export type LiveSession = Pick<Session, 'sendRealtimeInput' | 'close'>;
export type LiveConnect = (params: LiveConnectParameters) => Promise<LiveSession>;

export interface GeminiProviderOptions {
  model?: string;
  connectTimeoutMs?: number;
  /** Reconnect attempts after an unexpected disconnect before the session ends. */
  maxReconnectAttempts?: number;
  /** Delay before the first reconnect attempt; doubles on each further attempt. */
  reconnectDelayMs?: number;
  /** Audio chunks kept while reconnecting (100 ms each); the oldest are dropped first. */
  maxBufferedChunks?: number;
  /** Injected for tests; defaults to the real Gemini Live connection. */
  connect: LiveConnect;
}

const RETRYABLE_CODES = new Set<ProviderErrorCode>([
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
]);

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
    maxReconnectAttempts: Number(env.GEMINI_MAX_RECONNECT_ATTEMPTS ?? 3),
    connect: (params) => client.live.connect(params),
  };
}

/**
 * Gemini Live Translate adapter. One provider session translates one speaker's
 * audio into one target language; open a second session for the reverse direction.
 *
 * Long conversations survive provider disconnects: when Gemini announces it is
 * going away or the connection drops, the adapter reports `reconnecting`, opens
 * a new connection (resuming it when Gemini supplied a handle), buffers audio
 * meanwhile, and reports `live` again. Callers keep using the same session.
 */
export function createGeminiTranslationProvider(options: GeminiProviderOptions): TranslationProvider {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  const maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
  const reconnectDelayMs = options.reconnectDelayMs ?? 500;
  const maxBufferedChunks = options.maxBufferedChunks ?? 20;

  return {
    async start({ targetLanguage, sourceLanguage, sessionMode, onEvent }) {
      if (!BCP47_PATTERN.test(targetLanguage)) {
        throw new TranslationProviderError(
          'UNSUPPORTED_LANGUAGE',
          `"${targetLanguage}" is not a valid language code.`,
        );
      }

      let stopped = false;
      let reconnecting = false;
      let outputSequence = 0;
      // Callbacks from replaced connections are ignored by comparing generations.
      let generation = 0;
      let current: LiveSession | undefined;
      let resumeHandle: string | undefined;
      const pendingAudio: ArrayBuffer[] = [];
      const inputLanguageCodes = sourceLanguage
        ? sessionMode === 'sinhala'
          ? ['si']
          : [...new Set([sourceLanguage, 'si', 'en', 'ta', 'es', 'fr', 'de', 'ja'])]
        : undefined;

      function handleMessage(message: LiveServerMessage): void {
        if (message.setupComplete) onEvent({ type: 'status', status: 'live' });

        const update = message.sessionResumptionUpdate;
        if (update?.resumable && update.newHandle) resumeHandle = update.newHandle;

        if (message.goAway) void reconnect();

        const content = message.serverContent;
        if (!content) return;

        const input = content.inputTranscription;
        if (input?.text) {
          onEvent({ type: 'input_transcript', text: input.text, final: isFinal(input.text, input.finished) });
        }
        const output = content.outputTranscription;
        if (output?.text) {
          onEvent({ type: 'output_transcript', text: output.text, final: isFinal(output.text, output.finished) });
        }
        for (const part of content.modelTurn?.parts ?? []) {
          const data = part.inlineData?.data;
          if (!data) continue;
          onEvent({
            type: 'audio',
            pcm16: base64ToArrayBuffer(data),
            sequence: outputSequence++,
            sampleRate: sampleRateOf(part.inlineData?.mimeType),
          });
        }
      }

      function open(): Promise<LiveSession> {
        const connection = ++generation;
        const isActive = () => connection === generation && !stopped;

        return withTimeout(
          options.connect({
            model,
            config: {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: inputLanguageCodes ? { languageCodes: inputLanguageCodes } : {},
              outputAudioTranscription: {},
              translationConfig: { targetLanguageCode: targetLanguage },
              realtimeInputConfig: {
                automaticActivityDetection: {
                  disabled: false,
                  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                  endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                  prefixPaddingMs: 120,
                  silenceDurationMs: 450,
                },
              },
              sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
            },
            callbacks: {
              onmessage: (message) => {
                if (isActive()) handleMessage(message);
              },
              // An error is always followed by onclose, which decides what to do.
              onerror: () => {},
              onclose: (event) => {
                if (isActive()) void reconnect(codeFromClose(event.code, event.reason));
              },
            },
          }),
          connectTimeoutMs,
        );
      }

      function send(pcm16: ArrayBuffer): void {
        current?.sendRealtimeInput({
          audio: { data: Buffer.from(pcm16).toString('base64'), mimeType: INPUT_AUDIO_MIME_TYPE },
        });
      }

      function end(code: ProviderErrorCode): void {
        stopped = true;
        current = undefined;
        pendingAudio.length = 0;
        onEvent(errorEvent(code));
        onEvent({ type: 'status', status: 'ended' });
      }

      /** Replaces the connection. `cause` is absent for a planned switch (goAway). */
      async function reconnect(cause?: ProviderErrorCode): Promise<void> {
        if (stopped || reconnecting) return;
        if (cause && !RETRYABLE_CODES.has(cause)) {
          end(cause);
          return;
        }

        reconnecting = true;
        generation += 1;
        const previous = current;
        current = undefined;
        onEvent({ type: 'status', status: 'reconnecting' });
        try {
          previous?.close();
        } catch {
          // The old connection may already be gone.
        }

        let lastCode: ProviderErrorCode = cause ?? 'PROVIDER_UNAVAILABLE';
        for (let attempt = 0; attempt < maxReconnectAttempts; attempt += 1) {
          if (attempt > 0 || cause) await sleep(reconnectDelayMs * 2 ** attempt);
          if (stopped) return;
          try {
            // A resumable Gemini session already retains the audio context.
            // Re-sending buffered chunks here makes the same spoken phrase
            // translate twice after a normal go-away/reconnect cycle.
            const resumeExistingSession = Boolean(resumeHandle);
            const session = await open();
            if (stopped) {
              session.close();
              return;
            }
            // Gemini's setupComplete message on the new connection reports `live`.
            current = session;
            reconnecting = false;
            const chunksToReplay = resumeExistingSession ? [] : pendingAudio.splice(0);
            if (resumeExistingSession) pendingAudio.length = 0;
            for (const chunk of chunksToReplay) send(chunk);
            return;
          } catch (error) {
            lastCode = toProviderError(error).code;
            // A stale or rejected handle should not block a fresh session.
            resumeHandle = undefined;
            if (!RETRYABLE_CODES.has(lastCode)) break;
          }
        }

        reconnecting = false;
        end(lastCode);
      }

      try {
        current = await open();
      } catch (error) {
        throw toProviderError(error);
      }

      return {
        async sendAudio(pcm16) {
          if (stopped) {
            throw new TranslationProviderError(
              'PROVIDER_SESSION_CLOSED',
              'Cannot send audio after the translation session has closed.',
            );
          }
          if (!current) {
            pendingAudio.push(pcm16.slice(0));
            if (pendingAudio.length > maxBufferedChunks) pendingAudio.shift();
            return;
          }
          try {
            send(pcm16);
          } catch {
            pendingAudio.push(pcm16.slice(0));
            void reconnect('PROVIDER_UNAVAILABLE');
          }
        },

        async close() {
          if (stopped) return;
          stopped = true;
          generation += 1;
          pendingAudio.length = 0;
          const session = current;
          current = undefined;
          session?.close();
          onEvent({ type: 'status', status: 'ended' });
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

function isFinal(text: string, finished: boolean | undefined): boolean {
  return finished ?? SENTENCE_END.test(text);
}

/** Reads the rate from a MIME type such as "audio/pcm;rate=24000". */
function sampleRateOf(mimeType: string | undefined): number {
  const rate = Number(/rate=(\d+)/.exec(mimeType ?? '')?.[1]);
  return rate > 0 ? rate : OUTPUT_SAMPLE_RATE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToArrayBuffer(data: string): ArrayBuffer {
  const bytes = Buffer.from(data, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
