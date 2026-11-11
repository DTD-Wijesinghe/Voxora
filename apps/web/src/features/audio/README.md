# Audio module

Member 2 owns this folder. Add microphone permission handling, AudioWorklet capture, PCM16 16 kHz mono conversion, sequencing, buffering, mute, and playback.

## Proposed Voxora WebSocket Audio Protocol v1

This section is a proposal for backend review, not an approved contract.

### Client-to-server audio

Each microphone chunk is sent as one binary WebSocket message of exactly 3208 bytes:

| Offset | Size | Meaning |
| ---: | ---: | --- |
| 0 | 4 | ASCII `VOX1` |
| 4 | 4 | uint32 sequence number, little-endian |
| 8 | 3200 | 1600 signed PCM16 samples, 16 kHz mono, little-endian |

The frontend encoder is [websocket-audio-protocol-v1.ts](./websocket-audio-protocol-v1.ts).

### Proposed handshake

Before microphone capture begins, the client sends a JSON message:

```json
{
  "type": "audio_session_hello",
  "protocol": "voxora-audio-v1",
  "sessionId": "<server-issued-session-id>",
  "participantId": "<server-issued-participant-id>",
  "authentication": "backend-required"
}
```

The server acknowledges with:

```json
{
  "type": "audio_session_ready",
  "protocol": "voxora-audio-v1"
}
```

The current frontend deliberately does not implement credentials or authentication. A
real server must authenticate and authorize the session before acknowledging readiness.
`authentication: "backend-required"` is a declaration, not a credential and must not be
treated as production authentication.

### Proposed server-to-client audio

For the isolated frontend mock only, translated audio uses one binary `VOX1` frame with
the same 3208-byte layout and PCM16 format. The adapter is
[audio-session-protocol-v1.ts](./audio-session-protocol-v1.ts) and is intentionally
separate from the outgoing encoder so the backend output format can be replaced.

The backend must confirm whether output is binary or JSON/base64, its sample rate,
channels, byte order, chunk duration, and whether it uses this frame layout.

### Lifecycle and sequence proposal

The client connects, completes authentication and the handshake, then starts capture.
On disconnect or failed handshake it stops capture, clears pending audio, interrupts
speaker playback, and does not reconnect automatically. Sequence numbers are uint32
and should be monotonic within a stream. A new translation stream must explicitly reset
sequence state; stale frames from an earlier stream must be discarded.

Authentication, session expiry, server errors, control messages, reconnect semantics,
and sequence-gap policy remain backend/team decisions.

### Frontend integration and mock testing

[audio-session-controller.ts](./audio-session-controller.ts) composes microphone capture,
the outbound transport, the handshake gate, the proposed inbound adapter, and speaker
playback. It never starts capture until `audio_session_ready` is received. Microphone
mute and speaker mute are separate controls.

[mock-audio-websocket.ts](./mock-audio-websocket.ts) is an isolated development mock. It
does not authenticate, call Gemini, or translate audio. It acknowledges the proposed
handshake and echoes valid input frames as output only to verify the browser pipeline.
The mock identifiers used by the dev panel are mock-only and are not credentials.
