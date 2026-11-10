import { decodeAudioChunkV1 } from './websocket-audio-protocol-v1';

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

class MockWebSocketServer {
  public accept(client: MockWebSocket): void {
    queueMicrotask(() => client.open());
  }

  public receive(client: MockWebSocket, payload: string | ArrayBuffer | Blob): void {
    if (typeof payload === 'string') {
      const message = JSON.parse(payload) as { type?: string };
      if (message.type === 'audio_session_hello') {
        queueMicrotask(() =>
          client.receive(JSON.stringify({
            type: 'audio_session_ready',
            protocol: 'voxora-audio-v1',
          })),
        );
      }
      return;
    }

    if (payload instanceof ArrayBuffer) {
      try {
        decodeAudioChunkV1(payload);
        queueMicrotask(() => client.receive(payload.slice(0)));
      } catch {
        queueMicrotask(() => client.fail());
      }
    }
  }

  public close(client: MockWebSocket): void {
    client.closeFromServer();
  }
}

class MockWebSocket {
  public readonly CONNECTING = CONNECTING;
  public readonly OPEN = OPEN;
  public readonly CLOSING = CLOSING;
  public readonly CLOSED = CLOSED;
  public readyState = CONNECTING;
  public bufferedAmount = 0;
  public binaryType: BinaryType = 'arraybuffer';
  public onopen: ((event: Event) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  public constructor(private readonly server: MockWebSocketServer) {
    server.accept(this);
  }

  public send(payload: string | ArrayBuffer | Blob): void {
    if (this.readyState !== OPEN) {
      throw new Error('Mock WebSocket is not open.');
    }
    this.server.receive(this, payload);
  }

  public close(): void {
    if (this.readyState === CLOSED) {
      return;
    }
    this.readyState = CLOSING;
    queueMicrotask(() => this.closeFromServer());
  }

  public open(): void {
    this.readyState = OPEN;
    this.onopen?.(new Event('open'));
  }

  public receive(data: string | ArrayBuffer): void {
    if (this.readyState === OPEN) {
      this.onmessage?.(new MessageEvent('message', { data }));
    }
  }

  public fail(): void {
    this.onerror?.(new Event('error'));
    this.closeFromServer();
  }

  public closeFromServer(): void {
    this.readyState = CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

/**
 * Development-only mock. It acknowledges the proposed handshake and echoes
 * valid VOX1 input frames as translated audio for pipeline testing only.
 */
export function createMockAudioWebSocketFactory(): (url: string) => WebSocket {
  const server = new MockWebSocketServer();
  return () => new MockWebSocket(server) as unknown as WebSocket;
}
