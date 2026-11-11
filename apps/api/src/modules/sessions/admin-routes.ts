import type { FastifyInstance } from 'fastify';
import { networkInterfaces } from 'os';
import { adminSessions, persistAdminSessions } from './store.js';
import { requireAdmin } from '../auth/routes.js';
import { appendAudit, readAudit } from '../../storage/persistent-store.js';
import type { AdminSession, CreateAdminSessionRequest, UpdateAdminSessionRequest, SessionStatus, SessionMode } from './store.js';

/** Returns the active Wi-Fi or LAN IPv4 address, prioritizing real Wi-Fi/Ethernet subnets over virtual adapters (e.g. VirtualBox 192.168.56.x). */
function getLocalIp(): string {
  if (process.env.HOST_IP) return process.env.HOST_IP;
  const interfaces = networkInterfaces();
  
  // Prioritize active Wi-Fi interfaces
  for (const [name, ifaces] of Object.entries(interfaces)) {
    if (/wi-?fi|wlan/i.test(name)) {
      const match = ifaces?.find(i => i.family === 'IPv4' && !i.internal);
      if (match) return match.address;
    }
  }

  // Fallback: search non-internal IPv4 skipping typical host-only/virtual adapter subnets (192.168.56.x)
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const webPort = process.env.WEB_PORT ?? '5173';
  const webOrigin = process.env.WEB_ORIGIN?.includes('localhost')
    ? `http://${getLocalIp()}:${webPort}`
    : (process.env.WEB_ORIGIN ?? `http://${getLocalIp()}:${webPort}`);

  // GET /api/admin/sessions – list all
  app.get('/api/admin/sessions', async (_request, reply) => {
    if (!requireAdmin(_request, reply)) return;
    return reply.send(Array.from(adminSessions.values()));
  });

  app.get('/api/admin/history', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send(readAudit(100));
  });

  // GET /api/admin/sessions/:id – get single
  app.get<{ Params: { id: string } }>('/api/admin/sessions/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const session = adminSessions.get(request.params.id);
    if (!session) return reply.code(404).send({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });
    return reply.send(session);
  });

  // POST /api/admin/sessions – create
  app.post<{ Body: CreateAdminSessionRequest }>('/api/admin/sessions', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { title, participantLimit, expiresInMinutes = 60, mode = 'mix', sourceLanguage = 'si' } = request.body;
    const id = crypto.randomUUID();
    const joinCode = id.slice(0, 6).toUpperCase();
    const qrUrl = `${webOrigin}/join?code=${joinCode}`;
    const now = new Date();
    const session: AdminSession = {
      id,
      title,
      joinCode,
      status: 'connecting',
      participantLimit,
      participants: [{ id: `organizer-${id}`, displayName: 'Organizer', targetLanguage: sourceLanguage, isHost: true }],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString(),
      qrUrl,
      mode,
      sourceLanguage,
    };
    adminSessions.set(id, session);
    persistAdminSessions();
    appendAudit({ action: 'session.created', sessionId: id, metadata: { mode, sourceLanguage } });
    return reply.code(201).send(session);
  });

  // PATCH /api/admin/sessions/:id – update
  app.patch<{ Params: { id: string }; Body: UpdateAdminSessionRequest }>('/api/admin/sessions/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const session = adminSessions.get(request.params.id);
    if (!session) return reply.code(404).send({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });
    const { title, participantLimit, status, mode, sourceLanguage } = request.body as {
      title?: string;
      participantLimit?: number;
      status?: SessionStatus;
      mode?: SessionMode;
      sourceLanguage?: string;
    };
    if (title !== undefined) session.title = title;
    if (participantLimit !== undefined) session.participantLimit = participantLimit;
    if (status !== undefined) session.status = status;
    if (mode !== undefined) session.mode = mode;
    if (sourceLanguage !== undefined) session.sourceLanguage = sourceLanguage;
    adminSessions.set(session.id, session);
    persistAdminSessions();
    appendAudit({ action: 'session.updated', sessionId: session.id });
    return reply.send(session);
  });

  // DELETE /api/admin/sessions/:id – delete
  app.delete<{ Params: { id: string } }>('/api/admin/sessions/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    if (!adminSessions.has(request.params.id)) {
      return reply.code(404).send({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });
    }
    adminSessions.delete(request.params.id);
    persistAdminSessions();
    appendAudit({ action: 'session.deleted', sessionId: request.params.id });
    return reply.code(204).send();
  });

  // POST /api/sessions/:joinCode/join – join by joinCode
  app.post<{ Params: { joinCode: string }; Body: { displayName: string; targetLanguage: string } }>(
    '/api/sessions/:joinCode/join',
    async (request, reply) => {
      const { joinCode } = request.params;
      const { displayName, targetLanguage } = request.body as { displayName: string; targetLanguage: string };

      // Find the session by joinCode
      const session = Array.from(adminSessions.values()).find(s => s.joinCode === joinCode.toUpperCase());
      if (!session) return reply.code(404).send({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });

      if (session.participants.filter((participant) => !participant.isHost).length >= session.participantLimit) {
        return reply.code(409).send({ code: 'SESSION_FULL', message: 'Session has reached its participant limit' });
      }

      const participant = {
        id: crypto.randomUUID(),
        displayName,
        targetLanguage,
        isHost: false,
      };
      session.participants.push(participant);
      if (session.status === 'connecting') session.status = 'live';
      adminSessions.set(session.id, session);
      persistAdminSessions();
      appendAudit({ action: 'session.attendee_joined', sessionId: session.id, metadata: { language: targetLanguage } });

      return reply.send(session);
    },
  );
}
