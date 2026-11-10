import { CHUNK_SAMPLE_COUNT } from './pcm';
import type { AudioChunk } from './pcm';

/**
 * Proposed Voxora WebSocket Audio Protocol v1 frame:
 *
 *   offset  size  field
 *   0       4     ASCII magic "VOX1"
 *   4       4     unsigned 32-bit sequence number, little-endian
 *   8       3200  PCM16 payload, 16 kHz mono, little-endian
 *
 * Each frame is sent as one binary WebSocket message. There is no JSON,
 * base64 encoding, authentication, or control-message envelope here.
 */
export const AUDIO_PROTOCOL_V1_MAGIC = 'VOX1';
export const AUDIO_PROTOCOL_V1_HEADER_BYTES = 8;
export const AUDIO_PROTOCOL_V1_PAYLOAD_BYTES = CHUNK_SAMPLE_COUNT * 2;
export const AUDIO_PROTOCOL_V1_FRAME_BYTES =
  AUDIO_PROTOCOL_V1_HEADER_BYTES + AUDIO_PROTOCOL_V1_PAYLOAD_BYTES;
export const AUDIO_PROTOCOL_V1_MAX_SEQUENCE = 0xffff_ffff;

export class AudioProtocolV1Error extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AudioProtocolV1Error';
  }
}

export function encodeAudioChunkV1(chunk: AudioChunk): ArrayBuffer {
  validateSequence(chunk.sequence);

  if (chunk.pcm16.byteLength !== AUDIO_PROTOCOL_V1_PAYLOAD_BYTES) {
    throw new AudioProtocolV1Error(
      `Audio payload must be exactly ${AUDIO_PROTOCOL_V1_PAYLOAD_BYTES} bytes.`,
    );
  }

  const frame = new ArrayBuffer(AUDIO_PROTOCOL_V1_FRAME_BYTES);
  const bytes = new Uint8Array(frame);
  const view = new DataView(frame);

  for (let index = 0; index < AUDIO_PROTOCOL_V1_MAGIC.length; index += 1) {
    bytes[index] = AUDIO_PROTOCOL_V1_MAGIC.charCodeAt(index);
  }
  view.setUint32(4, chunk.sequence, true);
  bytes.set(new Uint8Array(chunk.pcm16), AUDIO_PROTOCOL_V1_HEADER_BYTES);

  return frame;
}

export function decodeAudioChunkV1(buffer: ArrayBuffer): AudioChunk {
  if (buffer.byteLength !== AUDIO_PROTOCOL_V1_FRAME_BYTES) {
    throw new AudioProtocolV1Error(
      `Audio frame must be exactly ${AUDIO_PROTOCOL_V1_FRAME_BYTES} bytes.`,
    );
  }

  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < AUDIO_PROTOCOL_V1_MAGIC.length; index += 1) {
    if (bytes[index] !== AUDIO_PROTOCOL_V1_MAGIC.charCodeAt(index)) {
      throw new AudioProtocolV1Error('Audio frame has an invalid VOX1 magic header.');
    }
  }

  const view = new DataView(buffer);
  const sequence = view.getUint32(4, true);
  const pcm16 = buffer.slice(
    AUDIO_PROTOCOL_V1_HEADER_BYTES,
    AUDIO_PROTOCOL_V1_FRAME_BYTES,
  );

  return { sequence, pcm16 };
}

function validateSequence(sequence: number): void {
  if (
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > AUDIO_PROTOCOL_V1_MAX_SEQUENCE
  ) {
    throw new AudioProtocolV1Error(
      `Audio sequence must be an integer from 0 to ${AUDIO_PROTOCOL_V1_MAX_SEQUENCE}.`,
    );
  }
}
