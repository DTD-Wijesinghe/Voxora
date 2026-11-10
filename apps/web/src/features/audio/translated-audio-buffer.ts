import type { AudioChunk } from './pcm';

export interface TranslatedAudioBufferOptions {
  maxChunks: number;
  initialSequence?: number;
}

export interface TranslatedAudioBufferDiagnostics {
  queuedChunks: number;
  droppedChunks: number;
  expectedSequence: number | null;
}

export type BufferPushResult = 'accepted' | 'dropped';

export class TranslatedAudioBuffer {
  private readonly maxChunks: number;
  private readonly chunks = new Map<number, AudioChunk>();
  private expectedSequence: number | null;
  private droppedChunks = 0;

  public constructor(options: TranslatedAudioBufferOptions) {
    if (!Number.isInteger(options.maxChunks) || options.maxChunks <= 0) {
      throw new RangeError('maxChunks must be a positive integer.');
    }

    if (
      options.initialSequence !== undefined &&
      (!Number.isInteger(options.initialSequence) || options.initialSequence < 0)
    ) {
      throw new RangeError('initialSequence must be a non-negative integer.');
    }

    this.maxChunks = options.maxChunks;
    this.expectedSequence = options.initialSequence ?? null;
  }

  public push(chunk: AudioChunk): BufferPushResult {
    if (!Number.isInteger(chunk.sequence) || chunk.sequence < 0) {
      this.droppedChunks += 1;
      return 'dropped';
    }

    if (this.expectedSequence === null) {
      this.expectedSequence = chunk.sequence;
    }

    if (chunk.sequence < this.expectedSequence || this.chunks.has(chunk.sequence)) {
      this.droppedChunks += 1;
      return 'dropped';
    }

    if (this.chunks.size >= this.maxChunks) {
      this.droppedChunks += 1;
      return 'dropped';
    }

    this.chunks.set(chunk.sequence, chunk);
    return 'accepted';
  }

  public takeNext(): AudioChunk | null {
    if (this.expectedSequence === null) {
      return null;
    }

    const chunk = this.chunks.get(this.expectedSequence);
    if (chunk === undefined) {
      return null;
    }

    this.chunks.delete(this.expectedSequence);
    this.expectedSequence += 1;
    return chunk;
  }

  public skipToNextAvailable(): boolean {
    if (this.expectedSequence === null || this.chunks.size === 0) {
      return false;
    }

    const nextSequence = Math.min(...this.chunks.keys());
    if (nextSequence <= this.expectedSequence) {
      return false;
    }

    this.expectedSequence = nextSequence;
    return true;
  }

  public hasGap(): boolean {
    return (
      this.expectedSequence !== null &&
      this.chunks.size > 0 &&
      !this.chunks.has(this.expectedSequence)
    );
  }

  public clear(initialSequence?: number): void {
    if (
      initialSequence !== undefined &&
      (!Number.isInteger(initialSequence) || initialSequence < 0)
    ) {
      throw new RangeError('initialSequence must be a non-negative integer.');
    }

    this.chunks.clear();
    this.expectedSequence = initialSequence ?? null;
  }

  public getDiagnostics(): TranslatedAudioBufferDiagnostics {
    return {
      queuedChunks: this.chunks.size,
      droppedChunks: this.droppedChunks,
      expectedSequence: this.expectedSequence,
    };
  }
}
