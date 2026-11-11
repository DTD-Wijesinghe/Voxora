import type { AudioChunk } from './pcm';
import { MicrophoneManager } from './microphone';
import { MicrophoneAudioCapture } from './audio-capture';
import { TranslatedAudioPlayback, TranslatedAudioPlaybackDiagnostics } from './translated-audio-playback';
import {
  AudioTransportMessage,
  WebSocketAudioState,
  WebSocketAudioTransport,
  WebSocketFactory,
  AudioChunkEncoder,
} from './websocket-audio-transport';
import {
  decodeProposedTranslatedAudio,
  isProposedAudioHandshakeAck,
} from './audio-session-protocol-v1';

export type AudioSessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CAPTURING'
  | 'MIC_MUTED'
  | 'SPEAKER_MUTED'
  | 'STOPPED'
  | 'ERROR';

export interface AudioSessionDiagnostics {
  state: AudioSessionState;
  connectionState: WebSocketAudioState;
  handshakeComplete: boolean;
  sentChunks: number;
  receivedChunks: number;
  droppedChunks: number;
  playback: TranslatedAudioPlaybackDiagnostics;
  error: string | null;
}

export interface AudioSessionControllerOptions {
  url: string;
  createHandshake: () => string | ArrayBuffer;
  encodeChunk: AudioChunkEncoder;
  decodeTranslatedAudio?: (message: AudioTransportMessage) => AudioChunk | null;
  isHandshakeComplete?: (message: AudioTransportMessage) => boolean;
  microphone?: MicrophoneManager;
  playback: Omit<ConstructorParameters<typeof TranslatedAudioPlayback>[0], 'onStateChange' | 'onError'>;
  webSocketFactory?: WebSocketFactory;
  onStateChange?: (diagnostics: AudioSessionDiagnostics) => void;
  onError?: (error: Error) => void;
}

export class AudioSessionController {
  private readonly transport: WebSocketAudioTransport;
  private readonly capture: MicrophoneAudioCapture;
  private readonly playback: TranslatedAudioPlayback;
  private readonly createHandshake: () => string | ArrayBuffer;
  private readonly decodeTranslatedAudio: (message: AudioTransportMessage) => AudioChunk | null;
  private readonly isHandshakeComplete: (message: AudioTransportMessage) => boolean;
  private readonly onStateChange?: (diagnostics: AudioSessionDiagnostics) => void;
  private readonly onError?: (error: Error) => void;
  private state: AudioSessionState = 'IDLE';
  private connectionState: WebSocketAudioState = 'CLOSED';
  private handshakeComplete = false;
  private pendingStart: Promise<void> | null = null;
  private generation = 0;
  private sentChunks = 0;
  private receivedChunks = 0;
  private lastError: string | null = null;
  private microphoneMuted = false;
  private speakerMuted = false;
  private stopping = false;

  public constructor(options: AudioSessionControllerOptions) {
    this.createHandshake = options.createHandshake;
    this.decodeTranslatedAudio =
      options.decodeTranslatedAudio ?? decodeProposedTranslatedAudio;
    this.isHandshakeComplete =
      options.isHandshakeComplete ?? isProposedAudioHandshakeAck;
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;
    this.playback = new TranslatedAudioPlayback({
      ...options.playback,
      onStateChange: () => this.publishDiagnostics(),
      onError: (error) => this.reportError(error),
    });

    const microphone = options.microphone ?? new MicrophoneManager();
    this.capture = new MicrophoneAudioCapture(microphone, (chunk) =>
      this.forwardMicrophoneChunk(chunk),
    );
    this.transport = new WebSocketAudioTransport({
      url: options.url,
      encodeChunk: options.encodeChunk,
      webSocketFactory: options.webSocketFactory,
      onStateChange: (state) => this.handleConnectionState(state),
      onMessage: (message) => this.handleMessage(message),
      onError: (error) => this.reportError(error),
    });
  }

  public async start(): Promise<void> {
    if (this.pendingStart !== null) {
      return this.pendingStart;
    }
    if (this.state === 'CAPTURING' || this.state === 'MIC_MUTED') {
      return;
    }

    const generation = ++this.generation;
    this.stopping = false;
    this.lastError = null;
    this.handshakeComplete = false;
    this.setState('CONNECTING');
    const pending = this.startSession(generation);
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
    this.handshakeComplete = false;
    this.capture.stop();
    this.transport.clearPendingChunks();
    this.transport.disconnect();
    this.playback.stop();
    this.setState('STOPPED');
  }

  public muteMicrophone(): void {
    if (this.state !== 'CAPTURING') {
      return;
    }
    this.capture.mute();
    this.microphoneMuted = true;
    this.setState('MIC_MUTED');
  }

  public unmuteMicrophone(): void {
    if (this.state !== 'MIC_MUTED') {
      return;
    }
    this.capture.unmute();
    this.microphoneMuted = false;
    this.setState('CAPTURING');
  }

  public muteSpeaker(): void {
    this.playback.mute();
    this.speakerMuted = true;
    this.publishDiagnostics();
  }

  public unmuteSpeaker(): void {
    this.playback.unmute();
    this.speakerMuted = false;
    this.publishDiagnostics();
  }

  public interruptSpeaker(): void {
    this.playback.interrupt();
    this.publishDiagnostics();
  }

  public getDiagnostics(): AudioSessionDiagnostics {
    const transportDiagnostics = this.transport.getDiagnostics();
    return {
      state: this.state,
      connectionState: this.connectionState,
      handshakeComplete: this.handshakeComplete,
      sentChunks: this.sentChunks,
      receivedChunks: this.receivedChunks,
      droppedChunks: transportDiagnostics.droppedChunks +
        this.playback.getDiagnostics().droppedChunks,
      playback: this.playback.getDiagnostics(),
      error: this.lastError,
    };
  }

  private async startSession(generation: number): Promise<void> {
    try {
      await this.playback.start();
      await this.transport.connect();
      this.assertCurrent(generation);
      this.setState('AUTHENTICATING');
      if (!this.transport.sendPayload(this.createHandshake())) {
        throw new Error('Unable to send the audio session handshake.');
      }
      await this.waitForHandshake(generation);
      await this.capture.start();
      this.assertCurrent(generation);
      this.setState(this.microphoneMuted ? 'MIC_MUTED' : 'CAPTURING');
    } catch (error: unknown) {
      if (this.isCurrent(generation)) {
        this.cleanupAfterFailure();
        this.setState('ERROR');
        this.reportError(error instanceof Error ? error : new Error('Audio session failed.'));
      }
      throw error;
    }
  }

  private waitForHandshake(generation: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        if (!this.isCurrent(generation)) {
          reject(new Error('Audio session start was cancelled.'));
        } else if (this.handshakeComplete) {
          resolve();
        } else if (this.connectionState === 'CLOSED') {
          reject(new Error('Audio session closed before handshake completed.'));
        } else {
          setTimeout(check, 0);
        }
      };
      check();
    });
  }

  private handleConnectionState(state: WebSocketAudioState): void {
    this.connectionState = state;
    this.publishDiagnostics();
    if (
      state === 'CLOSED' &&
      !this.stopping &&
      this.state !== 'IDLE' &&
      this.state !== 'STOPPED' &&
      this.state !== 'ERROR'
    ) {
      this.generation += 1;
      this.handshakeComplete = false;
      this.capture.stop();
      this.transport.clearPendingChunks();
      this.playback.stop();
      this.setState('ERROR');
      this.reportError(new Error('Audio session WebSocket disconnected.'));
    }
  }

  private handleMessage(message: AudioTransportMessage): void {
    if (!this.handshakeComplete && this.isHandshakeComplete(message)) {
      this.handshakeComplete = true;
      this.publishDiagnostics();
      return;
    }
    if (!this.handshakeComplete) {
      return;
    }

    try {
      const chunk = this.decodeTranslatedAudio(message);
      if (chunk !== null && this.playback.enqueueAudio(chunk)) {
        this.receivedChunks += 1;
      }
      this.publishDiagnostics();
    } catch (error: unknown) {
      this.reportError(error instanceof Error ? error : new Error('Invalid audio message.'));
    }
  }

  private forwardMicrophoneChunk(chunk: AudioChunk): void {
    if (
      !this.handshakeComplete ||
      this.connectionState !== 'OPEN' ||
      this.microphoneMuted ||
      this.state !== 'CAPTURING'
    ) {
      return;
    }
    if (this.transport.sendChunk(chunk)) {
      this.sentChunks += 1;
      this.publishDiagnostics();
    }
  }

  private cleanupAfterFailure(): void {
    this.capture.stop();
    this.transport.clearPendingChunks();
    this.transport.disconnect();
    this.playback.stop();
    this.handshakeComplete = false;
  }

  private assertCurrent(generation: number): void {
    if (!this.isCurrent(generation)) {
      throw new Error('Audio session start was cancelled.');
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

  private setState(state: AudioSessionState): void {
    this.state = state;
    this.publishDiagnostics();
  }

  private publishDiagnostics(): void {
    this.onStateChange?.(this.getDiagnostics());
  }

  private reportError(error: Error): void {
    this.lastError = error.message;
    this.onError?.(error);
    this.publishDiagnostics();
  }
}
