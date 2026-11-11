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

const SPEECH_RMS_THRESHOLD = 0.012;
const SILENCE_TAIL_CHUNKS = 3;
const MAX_TRANSPORT_RECONNECTS = 4;
const TRANSPORT_RECONNECT_DELAY_MS = 750;

export type AudioSessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CAPTURING'
  | 'LISTENING'
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
  playbackEnabled?: boolean;
  captureEnabled?: boolean;
  webSocketFactory?: WebSocketFactory;
  onStateChange?: (diagnostics: AudioSessionDiagnostics) => void;
  onError?: (error: Error) => void;
  onTranscript?: (transcript: { direction: 'source' | 'translated'; text: string; final: boolean }) => void;
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
  private readonly onTranscript?: AudioSessionControllerOptions['onTranscript'];
  private readonly playbackEnabled: boolean;
  private readonly captureEnabled: boolean;
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
  private silenceTailChunks = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(options: AudioSessionControllerOptions) {
    this.createHandshake = options.createHandshake;
    this.decodeTranslatedAudio =
      options.decodeTranslatedAudio ?? decodeProposedTranslatedAudio;
    this.isHandshakeComplete =
      options.isHandshakeComplete ?? isProposedAudioHandshakeAck;
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;
    this.onTranscript = options.onTranscript;
    this.playbackEnabled = options.playbackEnabled ?? true;
    this.captureEnabled = options.captureEnabled ?? true;
    this.playback = new TranslatedAudioPlayback({
      ...options.playback,
      onStateChange: () => this.publishDiagnostics(),
      onError: (error) => this.reportError(error),
    });

    const microphone = options.microphone ?? new MicrophoneManager();
    this.capture = new MicrophoneAudioCapture(
      microphone,
      (chunk) => this.forwardMicrophoneChunk(chunk),
      (error) => this.reportError(error),
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
    if (this.state === 'LISTENING') {
      if (this.playbackEnabled) {
        return this.playback.start();
      }
      return;
    }
    if (this.state === 'CAPTURING' || this.state === 'MIC_MUTED') {
      return;
    }

    const generation = ++this.generation;
    this.stopping = false;
    this.clearReconnectTimer();
    this.lastError = null;
    this.handshakeComplete = false;
    this.silenceTailChunks = 0;
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
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.pendingStart = null;
    this.handshakeComplete = false;
    this.capture.stop();
    this.silenceTailChunks = 0;
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
    this.silenceTailChunks = 0;
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
      if (this.playbackEnabled) {
        await this.playback.start();
      }
      await this.transport.connect();
      this.assertCurrent(generation);
      this.setState('AUTHENTICATING');
      if (!this.transport.sendPayload(this.createHandshake())) {
        throw new Error('Unable to send the audio session handshake.');
      }
      await this.waitForHandshake(generation);
      if (this.captureEnabled) {
        await this.capture.start();
      }
      this.assertCurrent(generation);
      this.reconnectAttempts = 0;
      this.setState(this.captureEnabled ? (this.microphoneMuted ? 'MIC_MUTED' : 'CAPTURING') : 'LISTENING');
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
      const wasActive = this.handshakeComplete || this.state === 'CAPTURING' || this.state === 'MIC_MUTED' || this.state === 'LISTENING';
      this.generation += 1;
      this.handshakeComplete = false;
      this.capture.stop();
      this.transport.clearPendingChunks();
      this.playback.stop();
      if (wasActive && this.reconnectAttempts < MAX_TRANSPORT_RECONNECTS) {
        this.setState('CONNECTING');
        this.scheduleReconnect();
      } else {
        this.setState('ERROR');
        this.reportError(new Error('Audio session WebSocket disconnected.'));
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.stopping) return;
    this.reconnectAttempts += 1;
    const delay = TRANSPORT_RECONNECT_DELAY_MS * this.reconnectAttempts;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start().catch((error: unknown) => {
        if (this.reconnectAttempts >= MAX_TRANSPORT_RECONNECTS) {
          this.setState('ERROR');
          this.reportError(error instanceof Error ? error : new Error('Unable to reconnect the audio session.'));
        }
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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

    if (typeof message === 'string') {
      try {
        const parsed = JSON.parse(message) as { type?: string; direction?: 'source' | 'translated'; text?: string; final?: boolean };
        if (parsed.type === 'transcript' && parsed.direction && parsed.text) {
          this.onTranscript?.({ direction: parsed.direction, text: parsed.text, final: parsed.final ?? true });
          return;
        }
      } catch {
        // Ignore non-JSON control frames after the handshake.
      }
    }

    try {
      const chunk = this.decodeTranslatedAudio(message);
      if (this.playbackEnabled && chunk !== null && this.playback.enqueueAudio(chunk)) {
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
    if (!this.containsSpeech(chunk.pcm16)) {
      if (this.silenceTailChunks === 0) return;
      this.silenceTailChunks -= 1;
    } else {
      // Keep a short tail so Gemini can detect the end of the utterance, then
      // stop forwarding silence instead of repeatedly extending old speech.
      this.silenceTailChunks = SILENCE_TAIL_CHUNKS;
    }
    if (this.transport.sendChunk(chunk)) {
      this.sentChunks += 1;
      this.publishDiagnostics();
    }
  }

  private containsSpeech(pcm16: ArrayBuffer): boolean {
    if (pcm16.byteLength < 2 || pcm16.byteLength % 2 !== 0) return false;
    const view = new DataView(pcm16);
    let energy = 0;
    const sampleCount = pcm16.byteLength / 2;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = view.getInt16(index * 2, true) / 32768;
      energy += sample * sample;
    }
    return Math.sqrt(energy / sampleCount) >= SPEECH_RMS_THRESHOLD;
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
