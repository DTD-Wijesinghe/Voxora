import type { AudioChunk } from './pcm';

export type WebSocketAudioState = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
export type WebSocketAudioPayload = Parameters<WebSocket['send']>[0];
export type AudioChunkEncoder = (chunk: AudioChunk) => WebSocketAudioPayload;
export type AudioTransportStateCallback = (state: WebSocketAudioState) => void;
export type AudioTransportErrorCallback = (error: Error) => void;

export interface WebSocketAudioTransportOptions {
  url: string;
  encodeChunk: AudioChunkEncoder;
  maxBufferedChunks?: number;
  maxSocketBufferedAmount?: number;
  onStateChange?: AudioTransportStateCallback;
  onError?: AudioTransportErrorCallback;
}

interface PendingConnection {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

const DEFAULT_MAX_BUFFERED_CHUNKS = 3;
const DEFAULT_MAX_SOCKET_BUFFERED_AMOUNT = 256 * 1024;

export class WebSocketAudioTransport {
  private readonly url: string;
  private readonly encodeChunk: AudioChunkEncoder;
  private readonly maxBufferedChunks: number;
  private readonly maxSocketBufferedAmount: number;
  private readonly onStateChange?: AudioTransportStateCallback;
  private readonly onError?: AudioTransportErrorCallback;
  private socket: WebSocket | null = null;
  private pendingChunks: AudioChunk[] = [];
  private pendingConnection: PendingConnection | null = null;
  private generation = 0;
  private state: WebSocketAudioState = 'CLOSED';

  public constructor(options: WebSocketAudioTransportOptions) {
    if (!options.url) {
      throw new TypeError('A WebSocket URL is required.');
    }

    if (
      !Number.isInteger(options.maxBufferedChunks ?? DEFAULT_MAX_BUFFERED_CHUNKS) ||
      (options.maxBufferedChunks ?? DEFAULT_MAX_BUFFERED_CHUNKS) < 0
    ) {
      throw new RangeError('maxBufferedChunks must be a non-negative integer.');
    }

    if (
      !Number.isFinite(options.maxSocketBufferedAmount ?? DEFAULT_MAX_SOCKET_BUFFERED_AMOUNT) ||
      (options.maxSocketBufferedAmount ?? DEFAULT_MAX_SOCKET_BUFFERED_AMOUNT) < 0
    ) {
      throw new RangeError('maxSocketBufferedAmount must be a non-negative number.');
    }

    this.url = options.url;
    this.encodeChunk = options.encodeChunk;
    this.maxBufferedChunks = options.maxBufferedChunks ?? DEFAULT_MAX_BUFFERED_CHUNKS;
    this.maxSocketBufferedAmount =
      options.maxSocketBufferedAmount ?? DEFAULT_MAX_SOCKET_BUFFERED_AMOUNT;
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;
  }

  public getState(): WebSocketAudioState {
    return this.state;
  }

  public connect(): Promise<void> {
    if (typeof WebSocket !== 'undefined' && this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (
      typeof WebSocket !== 'undefined' &&
      this.socket?.readyState === WebSocket.CONNECTING &&
      this.pendingConnection !== null
    ) {
      return this.pendingConnection.promise;
    }

    this.replaceSocket();

    if (typeof WebSocket === 'undefined') {
      const error = new Error('This browser does not support WebSocket connections.');
      this.reportError(error);
      return Promise.reject(error);
    }

    const socket = new WebSocket(this.url);
    const generation = ++this.generation;
    this.socket = socket;
    this.setState('CONNECTING');

    const pendingConnection = this.createPendingConnection();
    this.pendingConnection = pendingConnection;

    const handleOpen = () => {
      if (!this.isCurrent(socket, generation)) {
        return;
      }

      this.setState('OPEN');
      this.flushPendingChunks();
      if (this.pendingConnection === pendingConnection) {
        this.pendingConnection = null;
        pendingConnection.resolve();
      }
    };
    const handleError = () => {
      if (this.isCurrent(socket, generation)) {
        this.reportError(new Error('WebSocket audio transport error.'));
      }
    };
    const handleClose = () => {
      if (!this.isCurrent(socket, generation)) {
        return;
      }

      this.clearSocketListeners(socket);
      this.socket = null;
      this.pendingChunks = [];
      this.setState('CLOSED');

      if (this.pendingConnection === pendingConnection) {
        pendingConnection.reject(new Error('WebSocket audio transport closed before connecting.'));
        this.pendingConnection = null;
      }
    };

    socket.onopen = handleOpen;
    socket.onerror = handleError;
    socket.onclose = handleClose;
    return pendingConnection.promise;
  }

  public sendChunk(chunk: AudioChunk): boolean {
    const socket = this.socket;
    if (
      typeof WebSocket === 'undefined' ||
      socket === null ||
      socket.readyState === WebSocket.CLOSED ||
      socket.readyState === WebSocket.CLOSING
    ) {
      return false;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      return this.enqueueChunk(chunk);
    }

    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.flushPendingChunks();
    if (this.pendingChunks.length > 0 || socket.bufferedAmount > this.maxSocketBufferedAmount) {
      return this.enqueueChunk(chunk);
    }

    return this.sendEncodedChunk(socket, chunk);
  }

  public disconnect(): void {
    this.generation += 1;
    this.pendingChunks = [];
    this.rejectPendingConnection(new Error('WebSocket audio transport disconnected.'));

    const socket = this.socket;
    if (socket === null) {
      this.setState('CLOSED');
      return;
    }

    this.clearSocketListeners(socket);
    this.socket = null;

    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      this.setState('CLOSING');
      socket.close();
      this.setState('CLOSED');
    } else {
      this.setState('CLOSED');
    }
  }

  private replaceSocket(): void {
    if (this.socket !== null) {
      this.disconnect();
    }
    this.pendingChunks = [];
  }

  private enqueueChunk(chunk: AudioChunk): boolean {
    if (this.pendingChunks.length >= this.maxBufferedChunks) {
      return false;
    }

    this.pendingChunks.push(chunk);
    return true;
  }

  private flushPendingChunks(): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (
      this.pendingChunks.length > 0 &&
      socket.bufferedAmount <= this.maxSocketBufferedAmount
    ) {
      const chunk = this.pendingChunks.shift();
      if (chunk === undefined || !this.sendEncodedChunk(socket, chunk)) {
        return;
      }
    }
  }

  private sendEncodedChunk(socket: WebSocket, chunk: AudioChunk): boolean {
    try {
      socket.send(this.encodeChunk(chunk));
      return true;
    } catch (error: unknown) {
      const transportError =
        error instanceof Error ? error : new Error('Unable to send an audio chunk.');
      this.reportError(transportError);
      this.pendingChunks = [];
      this.disconnect();
      return false;
    }
  }

  private createPendingConnection(): PendingConnection {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  private rejectPendingConnection(error: Error): void {
    const pendingConnection = this.pendingConnection;
    this.pendingConnection = null;
    pendingConnection?.reject(error);
  }

  private isCurrent(socket: WebSocket, generation: number): boolean {
    return this.socket === socket && this.generation === generation;
  }

  private clearSocketListeners(socket: WebSocket): void {
    socket.onopen = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  private setState(state: WebSocketAudioState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  private reportError(error: Error): void {
    this.onError?.(error);
  }
}
