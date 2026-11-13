import { describe, expect, it, vi } from 'vitest';
import type { LiveCallbacks, LiveConnectParameters, LiveServerMessage } from '@google/genai';
import type { TranslationEvent } from '@voxora/contracts';
import { createGeminiTranslationProvider, readGeminiOptions } from './gemini-provider.js';
import type { LiveSession } from './gemini-provider.js';

/** Fake Gemini Live endpoint. Each connect() opens a new fake connection. */
function fakeGemini() {
  const connections: { params: LiveConnectParameters; session: LiveSession & { sendRealtimeInput: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } }[] = [];
  const connect = vi.fn(async (params: LiveConnectParameters) => {
    const session = { sendRealtimeInput: vi.fn(), close: vi.fn() };
    connections.push({ params, session });
    return session;
  });
  const latest = () => {
    const connection = connections.at(-1);
    if (!connection) throw new Error('connect was not called');
    return connection;
  };
  return {
    connect,
    connections,
    get session() {
      return latest().session;
    },
    get callbacks(): LiveCallbacks {
      return latest().params.callbacks;
    },
    get params() {
      return connections.at(-1)?.params;
    },
    message(m: Partial<LiveServerMessage>) {
      this.callbacks.onmessage(m as LiveServerMessage);
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function startSession(gemini = fakeGemini(), targetLanguage = 'es') {
  const events: TranslationEvent[] = [];
  const session = await createGeminiTranslationProvider({ connect: gemini.connect, reconnectDelayMs: 0 }).start({
    targetLanguage,
    onEvent: (e) => events.push(e),
  });
  return { gemini, events, session };
}

describe('createGeminiTranslationProvider', () => {
  it('connects with the translate model, target language and transcriptions', async () => {
    const { gemini } = await startSession(fakeGemini(), 'si');
    expect(gemini.params?.model).toBe('gemini-3.5-live-translate-preview');
    expect(gemini.params?.config).toMatchObject({
      translationConfig: { targetLanguageCode: 'si' },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          prefixPaddingMs: 160,
          silenceDurationMs: 300,
        },
      },
    });
  });

  it('uses a strict Sinhala hint in Sinhala mode', async () => {
    const gemini = fakeGemini();
    await createGeminiTranslationProvider({ connect: gemini.connect }).start({
      targetLanguage: 'ta',
      sourceLanguage: 'si',
      sessionMode: 'sinhala',
      onEvent: () => {},
    });
    expect(gemini.params?.config).toMatchObject({
      inputAudioTranscription: { languageCodes: ['si'] },
    });
  });

  it('prioritizes the selected language while keeping mix mode multilingual', async () => {
    const gemini = fakeGemini();
    await createGeminiTranslationProvider({ connect: gemini.connect }).start({
      targetLanguage: 'ta',
      sourceLanguage: 'si',
      sessionMode: 'mix',
      onEvent: () => {},
    });
    expect(gemini.params?.config).toMatchObject({
      inputAudioTranscription: { languageCodes: ['si', 'en', 'ta', 'es', 'fr', 'de', 'ja'] },
    });
  });

  it('sends audio as base64 PCM16 at 16 kHz', async () => {
    const { gemini, session } = await startSession();
    await session.sendAudio(new Uint8Array([1, 2, 3, 4]).buffer);
    expect(gemini.session.sendRealtimeInput).toHaveBeenCalledWith({
      audio: { data: 'AQIDBA==', mimeType: 'audio/pcm;rate=16000' },
    });
  });

  it('maps setup, transcripts and translated audio to Voxora events', async () => {
    const { gemini, events } = await startSession();
    gemini.message({ setupComplete: {} });
    gemini.message({
      serverContent: {
        inputTranscription: { text: 'Hello', finished: true },
        outputTranscription: { text: 'Hola' },
        modelTurn: { parts: [{ inlineData: { data: 'AQID' } }, { inlineData: { data: 'BAU=' } }] },
      },
    });

    expect(events[0]).toEqual({ type: 'status', status: 'live' });
    expect(events).toContainEqual({ type: 'input_transcript', text: 'Hello', final: true });
    expect(events).toContainEqual({ type: 'output_transcript', text: 'Hola', final: false });
    const audio = events.filter((e) => e.type === 'audio');
    expect(audio.map((e) => e.sequence)).toEqual([0, 1]);
    expect([...new Uint8Array(audio[0]!.pcm16)]).toEqual([1, 2, 3]);
  });

  it('reports the sample rate of translated audio, defaulting to 24 kHz', async () => {
    const { gemini, events } = await startSession();
    gemini.message({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: 'AQI=', mimeType: 'audio/pcm;rate=24000' } },
            { inlineData: { data: 'AQI=', mimeType: 'audio/pcm;rate=16000' } },
            { inlineData: { data: 'AQI=' } },
          ],
        },
      },
    });
    const rates = events.flatMap((e) => (e.type === 'audio' ? [e.sampleRate] : []));
    expect(rates).toEqual([24_000, 16_000, 24_000]);
  });

  it('marks a caption fragment final when it ends a sentence', async () => {
    const { gemini, events } = await startSession();
    for (const text of ['Hola, mi nombre', ' es Pradin.', ' ¿Cómo', ' estás?']) {
      gemini.message({ serverContent: { outputTranscription: { text } } });
    }
    expect(events.flatMap((e) => (e.type === 'output_transcript' ? [e.final] : []))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it('rejects invalid language codes before connecting', async () => {
    const gemini = fakeGemini();
    await expect(startSession(gemini, 'Tamil')).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    expect(gemini.connect).not.toHaveBeenCalled();
  });

  it('maps connection failures to stable codes without leaking provider text', async () => {
    const gemini = fakeGemini();
    gemini.connect.mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED: quota for project secret-id'));
    const error = await startSession(gemini).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
    expect(String((error as Error).message)).not.toContain('secret-id');
  });

  it('times out when the connection never opens', async () => {
    vi.useFakeTimers();
    try {
      const connect = vi.fn(() => new Promise<LiveSession>(() => {}));
      const started = createGeminiTranslationProvider({ connect, connectTimeoutMs: 50 }).start({
        targetLanguage: 'es',
        onEvent: () => {},
      });
      const assertion = expect(started).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes cleanly without an error and rejects audio afterwards', async () => {
    const { gemini, events, session } = await startSession();
    await session.close();
    await session.close();
    gemini.callbacks.onclose?.({ code: 1000, reason: '' } as CloseEvent);

    expect(gemini.session.close).toHaveBeenCalledOnce();
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'status', status: 'ended' });
    await expect(session.sendAudio(new ArrayBuffer(2))).rejects.toMatchObject({ code: 'PROVIDER_SESSION_CLOSED' });
  });
});

describe('reconnecting', () => {
  it('reconnects after an unexpected disconnect and keeps translating', async () => {
    const { gemini, events, session } = await startSession();
    const first = gemini.session;
    gemini.message({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AQI=' } }] } } });

    gemini.callbacks.onclose?.({ code: 1011, reason: 'Internal error' } as CloseEvent);
    expect(events.at(-1)).toEqual({ type: 'status', status: 'reconnecting' });
    await flush();

    expect(gemini.connect).toHaveBeenCalledTimes(2);
    gemini.message({ setupComplete: {} });
    gemini.message({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AwQ=' } }] } } });
    await session.sendAudio(new Uint8Array([9]).buffer);

    expect(events.at(-2)).toEqual({ type: 'status', status: 'live' });
    expect(events.filter((e) => e.type === 'audio').map((e) => e.sequence)).toEqual([0, 1]);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(gemini.session).not.toBe(first);
    expect(gemini.session.sendRealtimeInput).toHaveBeenCalledOnce();
  });

  it('buffers audio while reconnecting and sends it on the new connection', async () => {
    const gemini = fakeGemini();
    const { session } = await startSession(gemini);
    let openSecond: () => void = () => {};
    gemini.connect.mockImplementationOnce(async (params) => {
      await new Promise<void>((resolve) => (openSecond = resolve));
      const second = { sendRealtimeInput: vi.fn(), close: vi.fn() };
      gemini.connections.push({ params, session: second });
      return second;
    });

    gemini.callbacks.onclose?.({ code: 1006, reason: '' } as CloseEvent);
    await session.sendAudio(new Uint8Array([1]).buffer);
    await session.sendAudio(new Uint8Array([2]).buffer);
    await flush();
    openSecond();
    await flush();

    const sent = gemini.session.sendRealtimeInput.mock.calls.map(([p]) => (p as { audio: { data: string } }).audio.data);
    expect(sent).toEqual(['AQ==', 'Ag==']);
  });

  it('does not replay buffered audio when the session resumes', async () => {
    const gemini = fakeGemini();
    const { session } = await startSession(gemini);
    gemini.message({ sessionResumptionUpdate: { resumable: true, newHandle: 'handle-1' } });
    let openSecond: () => void = () => {};
    gemini.connect.mockImplementationOnce(async (params) => {
      await new Promise<void>((resolve) => (openSecond = resolve));
      const second = { sendRealtimeInput: vi.fn(), close: vi.fn() };
      gemini.connections.push({ params, session: second });
      return second;
    });

    gemini.callbacks.onclose?.({ code: 1006, reason: '' } as CloseEvent);
    await session.sendAudio(new Uint8Array([1]).buffer);
    await flush();
    openSecond();
    await flush();

    expect(gemini.session.sendRealtimeInput).not.toHaveBeenCalled();
  });

  it('switches connections when Gemini announces it is going away', async () => {
    const { gemini, events } = await startSession();
    const first = gemini.session;
    gemini.message({ goAway: { timeLeft: '10s' } });
    await flush();

    expect(first.close).toHaveBeenCalledOnce();
    expect(gemini.connect).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'status', status: 'reconnecting' });
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('resumes with the latest handle Gemini provided', async () => {
    const { gemini } = await startSession();
    expect(gemini.params?.config?.sessionResumption).toEqual({});
    gemini.message({ sessionResumptionUpdate: { resumable: true, newHandle: 'handle-2' } });
    gemini.callbacks.onclose?.({ code: 1011, reason: '' } as CloseEvent);
    await flush();
    expect(gemini.params?.config?.sessionResumption).toEqual({ handle: 'handle-2' });
  });

  it('ends with an error after the reconnect attempts run out', async () => {
    const gemini = fakeGemini();
    const { events, session } = await startSession(gemini);
    const callbacks = gemini.callbacks;
    gemini.connect.mockRejectedValue(new Error('503 unavailable'));

    callbacks.onclose?.({ code: 1011, reason: '' } as CloseEvent);
    for (let i = 0; i < 5; i += 1) await flush();

    expect(gemini.connect).toHaveBeenCalledTimes(4);
    expect(events.slice(-2)).toEqual([
      expect.objectContaining({ type: 'error', code: 'PROVIDER_UNAVAILABLE' }),
      { type: 'status', status: 'ended' },
    ]);
    await expect(session.sendAudio(new ArrayBuffer(2))).rejects.toMatchObject({ code: 'PROVIDER_SESSION_CLOSED' });
  });

  it('does not retry configuration errors', async () => {
    const { gemini, events } = await startSession();
    gemini.callbacks.onclose?.({ code: 1008, reason: 'PERMISSION_DENIED' } as CloseEvent);
    await flush();

    expect(gemini.connect).toHaveBeenCalledOnce();
    expect(events.slice(-2)).toEqual([
      expect.objectContaining({ type: 'error', code: 'PROVIDER_CONFIG_INVALID' }),
      { type: 'status', status: 'ended' },
    ]);
  });

  it('ignores events from a replaced connection', async () => {
    const { gemini, events } = await startSession();
    const oldCallbacks = gemini.callbacks;
    oldCallbacks.onclose?.({ code: 1011, reason: '' } as CloseEvent);
    await flush();
    const count = events.length;

    oldCallbacks.onmessage({ serverContent: { outputTranscription: { text: 'stale' } } } as LiveServerMessage);
    oldCallbacks.onclose?.({ code: 1011, reason: '' } as CloseEvent);
    await flush();

    expect(events).toHaveLength(count);
    expect(gemini.connect).toHaveBeenCalledTimes(2);
  });
});

describe('readGeminiOptions', () => {
  it('requires a project and an existing credentials file for Vertex AI', () => {
    expect(() => readGeminiOptions({ GEMINI_AUTH: 'vertex' })).toThrow(/GCP_PROJECT/);
    expect(() =>
      readGeminiOptions({ GEMINI_AUTH: 'vertex', GCP_PROJECT: 'p', GOOGLE_APPLICATION_CREDENTIALS: 'missing.json' }),
    ).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
  });

  it('requires a real API key in api-key mode', () => {
    expect(() => readGeminiOptions({ GEMINI_AUTH: 'api-key', GEMINI_API_KEY: 'replace_me' })).toThrow(/GEMINI_API_KEY/);
  });

  it('rejects unknown auth modes', () => {
    expect(() => readGeminiOptions({ GEMINI_AUTH: 'oauth' })).toThrow(/GEMINI_AUTH/);
  });

  it('uses the configured model', () => {
    expect(readGeminiOptions({ GEMINI_AUTH: 'api-key', GEMINI_API_KEY: 'k', GEMINI_LIVE_MODEL: 'm' }).model).toBe('m');
  });
});
