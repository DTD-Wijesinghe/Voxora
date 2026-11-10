# Translation provider adapter

Member 3 owns this folder. The browser must never receive Gemini credentials.

## Usage

```ts
import { createTranslationProvider } from './providers/index.js';

const provider = createTranslationProvider(); // reads TRANSLATION_PROVIDER
const session = await provider.start({ targetLanguage: 'es', onEvent: (event) => { /* forward to client */ } });
await session.sendAudio(pcm16Chunk); // PCM16, 16 kHz, mono, little-endian
await session.close();
```

Open one provider session per direction: speaker A's audio goes to a session whose `targetLanguage` is listener B's language.

## Providers

| `TRANSLATION_PROVIDER` | Status | Behaviour |
| --- | --- | --- |
| `mock` (default) | Ready | Echoes audio back after 200 ms and emits fake input/output transcripts every 10 chunks. No credentials needed. |
| `gemini` | In progress | Gemini Live Translate (`gemini-3.5-live-translate-preview`) via Vertex AI. |

## Errors

Provider failures are thrown as `TranslationProviderError` with a stable `code` (see `errors.ts`). Do not forward raw provider messages to the browser.
