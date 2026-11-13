import type { AudioChunk } from './pcm';
import {
  TranslatedAudioBuffer,
  TranslatedAudioBufferDiagnostics,
} from './translated-audio-buffer';

export type TranslatedAudioByteOrder = 'little-endian';
export type TranslatedAudioPlaybackState =
  | 'IDLE'
  | 'STARTING'
  | 'PLAYING'
  | 'MUTED'
  | 'STOPPED'
  | 'ERROR';

export interface TranslatedAudioPlaybackOptions {
  sampleRate: number;
  channelCount: 1;
  byteOrder: TranslatedAudioByteOrder;
  maxBufferedChunks?: number;
  missingSequenceWaitMs?: number;
  initialSequence?: number;
  onStateChange?: (diagnostics: TranslatedAudioPlaybackDiagnostics) => void;
  onError?: (error: Error) => void;
}

export interface TranslatedAudioPlaybackDiagnostics {
  state: TranslatedAudioPlaybackState;
  queuedChunks: number;
  droppedChunks: number;
  playedChunks: number;
  expectedSequence: number | null;
}

// Gemini may deliver several translated chunks in a burst. Keep enough room
// for that burst without adding a fixed startup delay; contiguous chunks are
// scheduled immediately by scheduleAvailable().
const DEFAULT_MAX_BUFFERED_CHUNKS = 24;
const DEFAULT_MISSING_SEQUENCE_WAIT_MS = 250;

export class TranslatedAudioPlayback {
  private readonly sampleRate: number;
  private readonly byteOrder: TranslatedAudioByteOrder;
  private readonly maxBufferedChunks: number;
  private readonly missingSequenceWaitMs: number;
  private readonly onStateChange?: (diagnostics: TranslatedAudioPlaybackDiagnostics) => void;
  private readonly onError?: (error: Error) => void;
  private readonly buffer: TranslatedAudioBuffer;
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStart: Promise<void> | null = null;
  private generation = 0;
  private state: TranslatedAudioPlaybackState = 'IDLE';
  private muted = false;
  private playedChunks = 0;

  public constructor(options: TranslatedAudioPlaybackOptions) {
    if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
      throw new RangeError('sampleRate must be a positive number.');
    }
    if (options.channelCount !== 1) {
      throw new RangeError('Only mono translated audio is currently supported.');
    }
    if (options.byteOrder !== 'little-endian') {
      throw new RangeError('Only little-endian translated audio is currently supported.');
    }

    const maxBufferedChunks = options.maxBufferedChunks ?? DEFAULT_MAX_BUFFERED_CHUNKS;
    if (!Number.isInteger(maxBufferedChunks) || maxBufferedChunks <= 0) {
      throw new RangeError('maxBufferedChunks must be a positive integer.');
    }

    const missingSequenceWaitMs =
      options.missingSequenceWaitMs ?? DEFAULT_MISSING_SEQUENCE_WAIT_MS;
    if (!Number.isFinite(missingSequenceWaitMs) || missingSequenceWaitMs < 0) {
      throw new RangeError('missingSequenceWaitMs must be a non-negative number.');
    }

    this.sampleRate = options.sampleRate;
    this.byteOrder = options.byteOrder;
    this.maxBufferedChunks = maxBufferedChunks;
    this.missingSequenceWaitMs = missingSequenceWaitMs;
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;
    this.buffer = new TranslatedAudioBuffer({
      maxChunks: maxBufferedChunks,
      initialSequence: options.initialSequence,
    });
  }

  public async start(): Promise<void> {
    if (this.pendingStart !== null) {
      return this.pendingStart;
    }
    if (this.context !== null && this.state !== 'STOPPED' && this.state !== 'ERROR') {
      await this.context.resume();
      return;
    }

    const generation = ++this.generation;
    this.setState('STARTING');
    const pending = this.startContext(generation);
    this.pendingStart = pending;
    pending.then(
      () => this.clearPendingStart(pending),
      () => this.clearPendingStart(pending),
    );
    return pending;
  }

  public enqueueAudio(chunk: AudioChunk): boolean {
    if (this.context === null || this.state === 'STOPPED' || this.state === 'ERROR') {
      this.reportError(new Error('Translated audio playback has not started.'));
      return false;
    }

    const accepted = this.buffer.push(chunk) === 'accepted';
    if (accepted) {
      try {
        this.scheduleAvailable();
      } catch (error: unknown) {
        this.clearScheduledPlayback();
        this.clearGapTimer();
        this.setState('ERROR');
        this.reportError(
          error instanceof Error ? error : new Error('Unable to decode translated audio.'),
        );
        return false;
      }
    } else {
      this.publishDiagnostics();
    }
    return accepted;
  }

  public stop(): void {
    this.generation += 1;
    this.pendingStart = null;
    this.clearScheduledPlayback();
    this.clearGapTimer();
    this.buffer.clear();
    this.closeContext();
    this.muted = false;
    this.setState('STOPPED');
  }

  public interrupt(): void {
    this.generation += 1;
    this.pendingStart = null;
    this.clearScheduledPlayback();
    this.clearGapTimer();
    this.buffer.clear();
    this.nextStartTime = 0;
    if (this.context !== null && this.state !== 'STOPPED') {
      this.setState(this.muted ? 'MUTED' : 'PLAYING');
    } else {
      this.setState('IDLE');
    }
  }

  public clearQueue(): void {
    this.interrupt();
  }

  public mute(): void {
    this.muted = true;
    if (this.gain !== null) {
      this.gain.gain.setValueAtTime(0, this.context?.currentTime ?? 0);
    }
    if (this.state === 'PLAYING') {
      this.setState('MUTED');
    }
  }

  public unmute(): void {
    this.muted = false;
    if (this.gain !== null) {
      this.gain.gain.setValueAtTime(1, this.context?.currentTime ?? 0);
    }
    if (this.state === 'MUTED') {
      this.setState('PLAYING');
    }
  }

  public resetStream(initialSequence?: number): void {
    this.generation += 1;
    this.clearScheduledPlayback();
    this.clearGapTimer();
    this.buffer.clear(initialSequence);
    this.nextStartTime = this.context?.currentTime ?? 0;
    this.publishDiagnostics();
  }

  public getDiagnostics(): TranslatedAudioPlaybackDiagnostics {
    const bufferDiagnostics = this.buffer.getDiagnostics();
    return {
      state: this.state,
      queuedChunks: bufferDiagnostics.queuedChunks,
      droppedChunks: bufferDiagnostics.droppedChunks,
      playedChunks: this.playedChunks,
      expectedSequence: bufferDiagnostics.expectedSequence,
    };
  }

  private async startContext(generation: number): Promise<void> {
    let context: AudioContext | null = null;
    try {
      if (typeof AudioContext === 'undefined') {
        throw new Error('This browser does not support Web Audio playback.');
      }

      context = new AudioContext({ latencyHint: 'interactive' });
      const gain = context.createGain();
      gain.gain.value = this.muted ? 0 : 1;
      gain.connect(context.destination);
      await context.resume();
      if (generation !== this.generation) {
        await context.close();
        return;
      }

      this.context = context;
      this.gain = gain;
      this.nextStartTime = context.currentTime;
      this.setState(this.muted ? 'MUTED' : 'PLAYING');
      context = null;
    } catch (error: unknown) {
      if (context !== null && context.state !== 'closed') {
        await context.close().catch(() => undefined);
      }
      if (generation === this.generation) {
        this.setState('ERROR');
        this.reportError(error instanceof Error ? error : new Error('Unable to start playback.'));
      }
      throw error;
    }
  }

  private scheduleAvailable(): void {
    const context = this.context;
    const gain = this.gain;
    if (context === null || gain === null || context.state === 'closed') {
      return;
    }

    let scheduled = false;
    while (true) {
      const chunk = this.buffer.takeNext();
      if (chunk === null) {
        break;
      }

      const sampleRate = chunk.sampleRate ?? this.sampleRate;
      const samples = this.decodePcm16(chunk.pcm16);
      const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
      audioBuffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);
      const startTime = Math.max(this.nextStartTime, context.currentTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
        this.playedChunks += 1;
        this.publishDiagnostics();
      };
      scheduled = true;
    }

    if (this.buffer.hasGap()) {
      this.scheduleGapSkip();
    } else if (scheduled) {
      this.clearGapTimer();
    }
    this.publishDiagnostics();
  }

  private scheduleGapSkip(): void {
    if (this.gapTimer !== null) {
      return;
    }

    this.gapTimer = setTimeout(() => {
      this.gapTimer = null;
      if (this.buffer.skipToNextAvailable()) {
        this.scheduleAvailable();
      }
    }, this.missingSequenceWaitMs);
  }

  private decodePcm16(pcm16: ArrayBuffer): Float32Array {
    if (pcm16.byteLength === 0 || pcm16.byteLength % 2 !== 0) {
      throw new Error('PCM16 playback payload must contain a non-zero even number of bytes.');
    }

    const view = new DataView(pcm16);
    const samples = new Float32Array(pcm16.byteLength / 2);
    for (let index = 0; index < samples.length; index += 1) {
      const value = view.getInt16(index * 2, this.byteOrder === 'little-endian');
      samples[index] = value < 0 ? value / 0x8000 : value / 0x7fff;
    }
    return samples;
  }

  private clearScheduledPlayback(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A source may already have ended.
      }
      source.disconnect();
    }
    this.sources.clear();
  }

  private closeContext(): void {
    const context = this.context;
    this.context = null;
    this.gain?.disconnect();
    this.gain = null;
    if (context !== null && context.state !== 'closed') {
      void context.close().catch((error: unknown) => this.reportError(
        error instanceof Error ? error : new Error('Unable to close playback context.'),
      ));
    }
  }

  private clearGapTimer(): void {
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  private clearPendingStart(pending: Promise<void>): void {
    if (this.pendingStart === pending) {
      this.pendingStart = null;
    }
  }

  private setState(state: TranslatedAudioPlaybackState): void {
    this.state = state;
    this.publishDiagnostics();
  }

  private publishDiagnostics(): void {
    this.onStateChange?.(this.getDiagnostics());
  }

  private reportError(error: Error): void {
    this.onError?.(error);
  }
}

export type { TranslatedAudioBufferDiagnostics };
