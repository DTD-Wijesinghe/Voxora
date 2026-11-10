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
| `gemini` | Ready for live testing | Gemini Live Translate (`gemini-3.5-live-translate-preview`). Source language is detected automatically. |

## Gemini setup

| Variable | Value |
| --- | --- |
| `GEMINI_AUTH` | `vertex` (service account) or `api-key` |
| `GCP_PROJECT`, `GCP_LOCATION` | Vertex AI project and location (default `global`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to the service-account JSON. Never commit this file. |
| `GEMINI_API_KEY` | Only for `api-key` mode |
| `GEMINI_LIVE_MODEL` | Defaults to `gemini-3.5-live-translate-preview` |
| `GEMINI_CONNECT_TIMEOUT_MS` | Defaults to `10000` |

Check your credentials with `pnpm --filter @voxora/api smoke:gemini [languageCode]`.

Audio formats: input PCM16 16 kHz mono; translated output PCM16 **24 kHz** mono, variable chunk size.

Known gaps: no automatic reconnect or session resumption yet, and `turnComplete`/`interrupted` signals are not forwarded because the shared contract has no event for them.

## Errors

Provider failures are thrown as `TranslationProviderError` with a stable `code` (see `errors.ts`). Do not forward raw provider messages to the browser.
