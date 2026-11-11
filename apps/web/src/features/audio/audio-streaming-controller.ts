import { AudioCaptureError, MicrophoneAudioCapture } from './audio-capture';
import { MicrophoneManager } from './microphone';
import type { AudioChunk } from './pcm';
import {
  WebSocketAudioState,
  WebSocketAudioTransport,
  WebSocketAudioTransportDiagnostics,
  AudioChunkEncoder,
} from './websocket-audio-transport';

export type AudioStreamingCaptureState =
  | 'IDLE'
  | 'CONNECTING'
  | 'STARTING'
  | 'CAPTURING'
  | 'MUTED'
  | 'STOPPED'
  | 'ERROR';

export interface AudioStreamingDiagnostics {
  connectionState: WebSocketAudioState;
  captureState: AudioStreamingCaptureState;
  droppedChunks: number;
  queuedChunks: number;
}

export interface AudioStreamingControllerOptions {
  url: string;
  encodeChunk: AudioChunkEncoder;
  microphone?: MicrophoneManager;
  maxBufferedChunks?: number;
  maxSocketBufferedAmount?: number;
  onStateChange?: (diagnostics: AudioStreamingDiagnostics) => void;
  onError?: (error: Error) => void;
}

export class AudioStreamingController {
  private readonly transport: WebSocketAudioTransport;
  private readonly capture: MicrophoneAudioCapture;
  private readonly onStateChange?: (diagnostics: AudioStreamingDiagnostics) => void;
  private readonly onError?: (error: Error) => void;
  private connectionState: WebSocketAudioState = 'CLOSED';
  private captureState: AudioStreamingCaptureState = 'IDLE';
  private pendingStart: Promise<void> | null = null;
  private generation = 0;
  private muted = false;
  private stopping = false;

  public constructor(options: AudioStreamingControllerOptions) {
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;

    const microphone = options.microphone ?? new MicrophoneManager();
    this.transport = new WebSocketAudioTransport({
      url: options.url,
      encodeChunk: options.encodeChunk,
      maxBufferedChunks: options.maxBufferedChunks,
      maxSocketBufferedAmount: options.maxSocketBufferedAmount,
      onStateChange: (state) => this.handleConnectionState(state),
      onError: (error) => this.handleTransportError(error),
    });
    this.capture = new MicrophoneAudioCapture(microphone, (chunk) =>
      this.forwardChunk(chunk),
    );
  }

  public start(): Promise<void> {
    if (this.pendingStart !== null) {
      return this.pendingStart;
    }

    if (this.captureState === 'CAPTURING' || this.captureState === 'MUTED') {
      return Promise.resolve();
    }

    const generation = ++this.generation;
    this.stopping = false;
    this.muted = false;
    this.setCaptureState('CONNECTING');
    const pending = this.startCapture(generation);
    this.pendingStart = pending;
    pending.then(
      () => this.clearPendingStart(pending),
      () => this.clearPendingStart(pending),
    );
    return pending;
  }

  public stop(): void {
    this.generation += 1;
    this.stopping = true;
    this.pendingStart = null;
    this.muted = false;
    this.transport.clearPendingChunks();
    this.capture.stop();
    this.transport.disconnect();
    this.setCaptureState('STOPPED');
  }

  public mute(): void {
    if (this.captureState !== 'CAPTURING') {
      return;
    }

    this.muted = true;
    this.transport.clearPendingChunks();
    this.capture.mute();
    this.setCaptureState('MUTED');
  }

  public unmute(): void {
    if (this.captureState !== 'MUTED') {
      return;
    }

    this.muted = false;
    this.transport.clearPendingChunks();
    this.capture.unmute();
    this.setCaptureState('CAPTURING');
  }

  public getDiagnostics(): AudioStreamingDiagnostics {
    const transportDiagnostics = this.transport.getDiagnostics();
    return {
      connectionState: this.connectionState,
      captureState: this.captureState,
      droppedChunks: transportDiagnostics.droppedChunks,
      queuedChunks: transportDiagnostics.queuedChunks,
    };
  }

  private async startCapture(generation: number): Promise<void> {
    try {
      await this.transport.connect();
      this.assertCurrent(generation);
      this.setCaptureState('STARTING');
      await this.capture.start();
      this.assertCurrent(generation);
      this.setCaptureState('CAPTURING');
    } catch (error: unknown) {
      if (this.isCurrent(generation)) {
        this.capture.stop();
        this.transport.clearPendingChunks();
        this.transport.disconnect();
        this.setCaptureState('ERROR');
        this.reportError(
          error instanceof Error ? error : new Error('Unable to start audio streaming.'),
        );
      }
      throw error;
    }
  }

  private forwardChunk(chunk: AudioChunk): void {
    if (
      this.muted ||
      (this.captureState !== 'CAPTURING' && this.captureState !== 'STARTING') ||
      this.connectionState !== 'OPEN'
    ) {
      return;
    }

    this.transport.sendChunk(chunk);
    this.publishState();
  }

  private handleConnectionState(state: WebSocketAudioState): void {
    this.connectionState = state;
    this.publishState();

    if (
      state === 'CLOSED' &&
      !this.stopping &&
      (this.captureState === 'CAPTURING' ||
        this.captureState === 'MUTED' ||
        this.captureState === 'STARTING')
    ) {
      this.generation += 1;
      this.transport.clearPendingChunks();
      this.capture.stop();
      this.setCaptureState('ERROR');
      this.reportError(new Error('WebSocket audio transport disconnected.'));
    }
  }

  private handleTransportError(error: Error): void {
    this.reportError(error);
  }

  private assertCurrent(generation: number): void {
    if (!this.isCurrent(generation)) {
      throw new AudioCaptureError('cancelled', 'Audio streaming start was cancelled.');
    }
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private clearPendingStart(pending: Promise<void>): void {
    if (this.pendingStart === pending) {
      this.pendingStart = null;
    }
  }

  private setCaptureState(state: AudioStreamingCaptureState): void {
    this.captureState = state;
    this.publishState();
  }

  private publishState(): void {
    this.onStateChange?.(this.getDiagnostics());
  }

  private reportError(error: Error): void {
    this.onError?.(error);
  }
}

export type { AudioChunkEncoder, WebSocketAudioTransportDiagnostics };
