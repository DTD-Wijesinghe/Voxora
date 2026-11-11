import type { FastifyInstance } from 'fastify';
import { createTranslationProvider } from '../../providers/index.js';
import { findSession } from '../sessions/routes.js';

interface AudioPeer { socket: any; participantId: string; provider: Awaited<ReturnType<ReturnType<typeof createTranslationProvider>['start']>>; }
interface AudioHello { type: 'audio_session_hello'; protocol: 'voxora-audio-v1'; sessionId: string; participantId: string; targetLanguage: string; }

const rooms = new Map<string, Set<AudioPeer>>();
const MAGIC = [0x56, 0x4f, 0x58, 0x31];
const FRAME_HEADER_BYTES = 8;

function decodeInputFrame(data: Buffer | ArrayBuffer): { sequence: number; pcm16: ArrayBuffer } {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data));
  if (bytes.length < FRAME_HEADER_BYTES || MAGIC.some((value, index) => bytes[index] !== value)) throw new Error('Invalid audio frame.');
  const payload = Uint8Array.from(bytes.subarray(FRAME_HEADER_BYTES));
  return { sequence: bytes.readUInt32LE(4), pcm16: payload.buffer };
}

function sendJson(socket: any, payload: unknown): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function toBase64(data: ArrayBuffer): string { return Buffer.from(data).toString('base64'); }

export async function registerAudioRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audio', { websocket: true }, (socket) => {
    let roomId: string | null = null;
    let peer: AudioPeer | null = null;
    let closed = false;
    let messageQueue = Promise.resolve();

    const cleanup = async () => {
      if (closed) return;
      closed = true;
      if (roomId && peer) {
        const room = rooms.get(roomId);
        room?.delete(peer);
        if (room && room.size === 0) rooms.delete(roomId);
      }
      await peer?.provider.close().catch(() => undefined);
    };

    async function handleMessage(raw: Buffer): Promise<void> {
      try {
        if (!peer) {
          const hello = JSON.parse(raw.toString()) as Partial<AudioHello>;
          if (hello.type !== 'audio_session_hello' || hello.protocol !== 'voxora-audio-v1' || !hello.sessionId || !hello.participantId || !hello.targetLanguage) throw new Error('Invalid audio handshake.');
          const session = findSession(hello.sessionId);
          if (!session || session.status === 'ended' || !session.participants.some((participant) => participant.id === hello.participantId)) throw new Error('Audio session is not authorized.');
          const provider = await createTranslationProvider().start({
            targetLanguage: hello.targetLanguage,
            onEvent: (event) => {
              if (event.type === 'audio') sendJson(socket, { type: 'audio', sequence: event.sequence, sampleRate: event.sampleRate, pcm16: toBase64(event.pcm16) });
              else if (event.type === 'input_transcript') sendJson(socket, { type: 'transcript', direction: 'source', text: event.text, final: event.final });
              else if (event.type === 'output_transcript') sendJson(socket, { type: 'transcript', direction: 'translated', text: event.text, final: event.final });
              else sendJson(socket, event);
            },
          });
          roomId = session.id;
          peer = { socket, participantId: hello.participantId, provider };
          const room = rooms.get(roomId) ?? new Set<AudioPeer>();
          room.add(peer);
          rooms.set(roomId, room);
          sendJson(socket, { type: 'audio_session_ready', protocol: 'voxora-audio-v1' });
          return;
        }

        const frame = decodeInputFrame(raw);
        const room = roomId ? rooms.get(roomId) : undefined;
        const recipients = room ? Array.from(room).filter((candidate) => candidate !== peer) : [];
        // In a one-person local test, loop the audio back so the complete path can be verified.
        const targets = recipients.length > 0 ? recipients : [peer];
        await Promise.all(targets.map((target) => target.provider.sendAudio(frame.pcm16)));
      } catch (error) {
        app.log.warn({ err: error }, 'Audio WebSocket session closed after a protocol/provider error.');
        sendJson(socket, { type: 'error', code: 'AUDIO_SESSION_ERROR', message: error instanceof Error ? error.message : 'Audio session failed.' });
        await cleanup();
        socket.close();
      }
    }

    // Handshake/provider setup is asynchronous. Serialize frames so an early
    // audio chunk can never race the handshake and be parsed as JSON.
    socket.on('message', (raw: Buffer) => {
      messageQueue = messageQueue.then(() => handleMessage(raw)).catch(() => undefined);
    });
    socket.on('close', () => { void cleanup(); });
    socket.on('error', () => { void cleanup(); });
  });
}
