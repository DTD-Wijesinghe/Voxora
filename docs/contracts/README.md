# Shared contracts

Record changes to API routes, audio format, WebSocket messages, translation events, error codes, and session lifecycle here. Update `packages/contracts` in the same pull request.

## Changelog

### 2026-11-11 — Translation event audio rate and caption finality (Member 3)

Affects: Member 2 (audio playback), Member 1 (captions), Member 4 (WebSocket forwarding).

- `TranslationEvent` `audio` now has a required `sampleRate`. Gemini Live Translate returns **PCM16 mono little-endian at 24 000 Hz in variable-length chunks**; the mock provider echoes at 16 000 Hz. Players must use `sampleRate` and must not assume a fixed chunk size.
- Transcript events are fragments. Append them to the current caption line; `final: true` marks the end of a sentence, after which a new line starts. Gemini does not mark finality itself, so the provider derives it from sentence-ending punctuation.
- Checked against the live model: it streams continuously and sends no `turnComplete` or `interrupted` signals, so no turn or interruption events are defined.

Input audio is unchanged: PCM16 mono little-endian at 16 000 Hz, 100 ms (3 200-byte) chunks.

