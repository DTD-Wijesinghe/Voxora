import {
  decodeAudioChunkV1,
  encodeAudioChunkV1,
} from './websocket-audio-protocol-v1';
import type { AudioChunk } from './pcm';
import type {
  AudioTransportMessage,
  WebSocketAudioPayload,
} from './websocket-audio-transport';

export interface ProposedAudioHandshake {
  type: 'audio_session_hello';
  protocol: 'voxora-audio-v1';
  sessionId: string;
  participantId: string;
  authentication: 'backend-required';
  targetLanguage?: string;
}

export interface ProposedAudioHandshakeAck {
  type: 'audio_session_ready';
  protocol: 'voxora-audio-v1';
}

export function createProposedAudioHandshake(
  input: Omit<ProposedAudioHandshake, 'type' | 'protocol'>,
): string {
  return JSON.stringify({
    type: 'audio_session_hello',
    protocol: 'voxora-audio-v1',
    ...input,
  } satisfies ProposedAudioHandshake);
}

export function isProposedAudioHandshakeAck(
  message: AudioTransportMessage,
): boolean {
  if (typeof message !== 'string') {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(message);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as Partial<ProposedAudioHandshakeAck>).type === 'audio_session_ready' &&
      (parsed as Partial<ProposedAudioHandshakeAck>).protocol === 'voxora-audio-v1'
    );
  } catch {
    return false;
  }
}

/**
 * Proposed server-to-client adapter. The backend would send one VOX1 binary
 * frame per translated PCM16 chunk. This is intentionally separate from the
 * outgoing encoder so the server format can be replaced independently.
 */
export function decodeProposedTranslatedAudio(
  message: AudioTransportMessage,
): AudioChunk | null {
  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message) as { type?: string; sequence?: number; sampleRate?: number; pcm16?: string };
      if (parsed.type !== 'audio' || typeof parsed.pcm16 !== 'string' || typeof parsed.sequence !== 'number') return null;
      const bytes = Uint8Array.from(atob(parsed.pcm16), (character) => character.charCodeAt(0));
      return { sequence: parsed.sequence, pcm16: bytes.buffer, sampleRate: parsed.sampleRate };
    } catch {
      return null;
    }
  }

  if (!(message instanceof ArrayBuffer)) {
    return null;
  }

  return decodeAudioChunkV1(message);
}

export const encodeProposedInputAudio = encodeAudioChunkV1;
export type ProposedAudioPayload = WebSocketAudioPayload;
