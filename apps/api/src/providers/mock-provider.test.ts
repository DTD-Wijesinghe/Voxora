import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationEvent } from '@voxora/contracts';
import { createTranslationProvider, TranslationProviderError } from './index.js';
import { createMockTranslationProvider } from './mock-provider.js';

const chunk = () => new Int16Array(1600).buffer;

describe('createMockTranslationProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports live status as soon as it starts', async () => {
    const events: TranslationEvent[] = [];
    await createMockTranslationProvider().start({ targetLanguage: 'es', onEvent: (e) => events.push(e) });
    expect(events).toEqual([{ type: 'status', status: 'live' }]);
  });

  it('echoes audio after the delay with increasing sequence numbers', async () => {
    const events: TranslationEvent[] = [];
    const session = await createMockTranslationProvider({ delayMs: 100 }).start({
      targetLanguage: 'es',
      onEvent: (e) => events.push(e),
    });

    await session.sendAudio(chunk());
    await session.sendAudio(chunk());
    expect(events.filter((e) => e.type === 'audio')).toHaveLength(0);

    vi.advanceTimersByTime(100);
    const audio = events.filter((e) => e.type === 'audio');
    expect(audio.map((e) => e.sequence)).toEqual([0, 1]);
    expect(audio[0]?.pcm16.byteLength).toBe(3200);
  });

  it('emits input and output transcripts after each phrase', async () => {
    const events: TranslationEvent[] = [];
    const session = await createMockTranslationProvider({ delayMs: 0, chunksPerPhrase: 2 }).start({
      targetLanguage: 'si',
      onEvent: (e) => events.push(e),
    });

    await session.sendAudio(chunk());
    await session.sendAudio(chunk());
    vi.runAllTimers();

    expect(events).toContainEqual({ type: 'input_transcript', text: 'Mock phrase 1', final: true });
    expect(events).toContainEqual({ type: 'output_transcript', text: '[si] Mock translation 1', final: true });
  });

  it('drops pending events and rejects audio after close', async () => {
    const events: TranslationEvent[] = [];
    const session = await createMockTranslationProvider({ delayMs: 100 }).start({
      targetLanguage: 'es',
      onEvent: (e) => events.push(e),
    });

    await session.sendAudio(chunk());
    await session.close();
    await session.close();
    vi.runAllTimers();

    expect(events).toEqual([
      { type: 'status', status: 'live' },
      { type: 'status', status: 'ended' },
    ]);
    await expect(session.sendAudio(chunk())).rejects.toMatchObject({ code: 'PROVIDER_SESSION_CLOSED' });
  });
});

describe('createTranslationProvider', () => {
  it('defaults to the mock provider', () => {
    expect(createTranslationProvider({})).toBeDefined();
  });

  it('rejects unknown providers with a config error', () => {
    expect(() => createTranslationProvider({ TRANSLATION_PROVIDER: 'other' })).toThrow(TranslationProviderError);
  });

  it('rejects Gemini when credentials are missing', () => {
    expect(() => createTranslationProvider({ TRANSLATION_PROVIDER: 'gemini', GEMINI_AUTH: 'vertex' })).toThrow(
      /GCP_PROJECT/,
    );
  });
});
