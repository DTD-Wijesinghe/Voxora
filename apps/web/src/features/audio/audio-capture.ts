import { MicrophoneError, MicrophoneManager } from './microphone';
import {
  AudioChunkCallback,
  CHUNK_SAMPLE_COUNT,
  PcmChunker,
  StreamingResampler,
} from './pcm';

export type AudioCaptureErrorCode = 'unsupported' | 'unavailable' | 'cancelled';

export class AudioCaptureError extends Error {
  public readonly code: AudioCaptureErrorCode;

  public constructor(code: AudioCaptureErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AudioCaptureError';
    this.code = code;

    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface AudioCaptureDiagnostics {
  inputSampleRate: number | null;
  chunkCount: number;
  lastSequence: number | null;
}

export class MicrophoneAudioCapture {
  private readonly microphone: MicrophoneManager;
  private readonly onChunk: AudioChunkCallback;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private resampler: StreamingResampler | null = null;
  private chunker: PcmChunker | null = null;
  private pendingStart: Promise<void> | null = null;
  private generation = 0;
  private muted = false;
  private diagnostics: AudioCaptureDiagnostics = {
    inputSampleRate: null,
    chunkCount: 0,
    lastSequence: null,
  };

  public constructor(microphone: MicrophoneManager, onChunk: AudioChunkCallback) {
    this.microphone = microphone;
    this.onChunk = onChunk;
  }

  public async start(): Promise<void> {
    if (this.pendingStart !== null) {
      return this.pendingStart;
    }

    if (this.context !== null && this.worklet !== null) {
      return;
    }

    const generation = ++this.generation;
    const pending = this.startCapture(generation);
    this.pendingStart = pending;
    pending.then(
      () => this.clearPending(pending),
      () => this.clearPending(pending),
    );
    return pending;
  }

  public stop(): void {
    this.generation += 1;
    this.pendingStart = null;
    this.cleanup();
    this.microphone.stop();
    this.resetBuffers();
    this.muted = false;
  }

  public mute(): void {
    this.microphone.mute();
    this.muted = true;
    this.resetBuffers();
  }

  public unmute(): void {
    this.microphone.unmute();
    this.muted = false;
    this.resetBuffers();
  }

  public getDiagnostics(): AudioCaptureDiagnostics {
    return { ...this.diagnostics };
  }

  private async startCapture(generation: number): Promise<void> {
    if (
      typeof AudioContext === 'undefined' ||
      typeof AudioWorkletNode === 'undefined' ||
      !('audioWorklet' in AudioContext.prototype)
    ) {
      throw new AudioCaptureError(
        'unsupported',
        'This browser does not support AudioWorklet microphone capture.',
      );
    }

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let worklet: AudioWorkletNode | null = null;

    try {
      stream = await this.microphone.start();
      this.assertCurrent(generation);

      context = new AudioContext();
      await context.audioWorklet.addModule(new URL('./capture-worklet.ts', import.meta.url));
      this.assertCurrent(generation);

      const resampler = new StreamingResampler(context.sampleRate);
      const chunker = new PcmChunker((chunk) => {
        this.diagnostics.chunkCount += 1;
        this.diagnostics.lastSequence = chunk.sequence;
        this.onChunk(chunk);
      });
      const sourceNode = context.createMediaStreamSource(stream);
      source = sourceNode;
      const workletNode = new AudioWorkletNode(context, 'voxora-microphone-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      worklet = workletNode;

      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!this.isCurrent(generation) || this.muted) {
          return;
        }

        chunker.push(resampler.push(event.data));
      };
      workletNode.onprocessorerror = () => {
        if (!this.isCurrent(generation)) {
          return;
        }

        this.cleanup();
        this.microphone.stop();
        this.resetBuffers();
      };
      sourceNode.connect(workletNode);
      workletNode.connect(context.destination);
      await context.resume();
      this.assertCurrent(generation);

      this.context = context;
      this.source = source;
      this.worklet = worklet;
      this.resampler = resampler;
      this.chunker = chunker;
      this.diagnostics = {
        inputSampleRate: context.sampleRate,
        chunkCount: 0,
        lastSequence: null,
      };
      context = null;
      source = null;
      worklet = null;
    } catch (error: unknown) {
      worklet?.port.close();
      worklet?.disconnect();
      source?.disconnect();
      if (context !== null) {
        await context.close().catch(() => undefined);
      }
      if (stream !== null && this.microphone.getStream() === stream) {
        this.microphone.stop();
      }

      if (error instanceof AudioCaptureError || error instanceof MicrophoneError) {
        throw error;
      }

      throw new AudioCaptureError('unavailable', 'Unable to start audio capture.', error);
    } finally {
      if (
        stream !== null &&
        !this.isCurrent(generation) &&
        this.microphone.getStream() === stream
      ) {
        this.microphone.stop();
      }
    }
  }

  private assertCurrent(generation: number): void {
    if (!this.isCurrent(generation)) {
      throw new AudioCaptureError('cancelled', 'Audio capture start was cancelled.');
    }
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private clearPending(pending: Promise<void>): void {
    if (this.pendingStart === pending) {
      this.pendingStart = null;
    }
  }

  private resetBuffers(): void {
    this.resampler?.reset();
    this.chunker?.reset();
  }

  private cleanup(): void {
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.worklet = null;
    this.source = null;
    this.resampler = null;
    this.chunker = null;

    const context = this.context;
    this.context = null;
    if (context !== null && context.state !== 'closed') {
      void context.close();
    }
  }
}

export { CHUNK_SAMPLE_COUNT };
