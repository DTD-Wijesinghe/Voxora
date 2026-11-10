import { describe, expect, it, vi } from 'vitest';
import type { LiveCallbacks, LiveConnectParameters, LiveServerMessage } from '@google/genai';
import type { TranslationEvent } from '@voxora/contracts';
import { createGeminiTranslationProvider, readGeminiOptions } from './gemini-provider.js';
import type { LiveSession } from './gemini-provider.js';

function fakeGemini() {
  let params: LiveConnectParameters | undefined;
  const session = { sendRealtimeInput: vi.fn(), close: vi.fn() } satisfies LiveSession;
  const connect = vi.fn(async (p: LiveConnectParameters) => {
    params = p;
    return session;
  });
  return {
    session,
    connect,
    get callbacks(): LiveCallbacks {
      if (!params) throw new Error('connect was not called');
      return params.callbacks;
    },
    get params() {
      return params;
    },
    message(m: Partial<LiveServerMessage>) {
      this.callbacks.onmessage(m as LiveServerMessage);
    },
  };
}

async function startSession(gemini = fakeGemini(), targetLanguage = 'es') {
  const events: TranslationEvent[] = [];
  const session = await createGeminiTranslationProvider({ connect: gemini.connect }).start({
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

  it('reports an error when the provider disconnects unexpectedly', async () => {
    const { gemini, events } = await startSession();
    gemini.callbacks.onclose?.({ code: 1011, reason: 'Internal error' } as CloseEvent);
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'PROVIDER_UNAVAILABLE' }));
    expect(events.at(-1)).toEqual({ type: 'status', status: 'ended' });
  });

  it('closes cleanly without an error and rejects audio afterwards', async () => {
    const { gemini, events, session } = await startSession();
    await session.close();
    await session.close();
    gemini.callbacks.onclose?.({ code: 1000, reason: '' } as CloseEvent);

    expect(gemini.session.close).toHaveBeenCalledOnce();
    expect(events.some((e) => e.type === 'error')).toBe(false);
    await expect(session.sendAudio(new ArrayBuffer(2))).rejects.toMatchObject({ code: 'PROVIDER_SESSION_CLOSED' });
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
