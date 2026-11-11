import type { FastifyInstance } from 'fastify';
import type { CreateSessionRequest, Session } from '@voxora/contracts';
import { adminSessions } from './store.js';

const sessions = new Map<string, Session>();

export function findSession(idOrCode: string): Session | import('@voxora/contracts').AdminSession | undefined {
  const normalized = idOrCode.toUpperCase();
  return sessions.get(idOrCode) ?? Array.from(adminSessions.values()).find(
    (session) => session.id === idOrCode || session.joinCode === normalized,
  );
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateSessionRequest }>('/api/sessions', async (request, reply) => {
    const id = crypto.randomUUID();
    const session: Session = {
      id,
      joinCode: id.slice(0, 6).toUpperCase(),
      status: 'connecting',
      participants: [{ id: crypto.randomUUID(), displayName: request.body.displayName, targetLanguage: request.body.targetLanguage, isHost: true }],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    sessions.set(id, session);
    return reply.code(201).send(session);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    // Check local session store first
    const session = findSession(request.params.id);
    if (session) return session;

    return reply.code(404).send({ code: 'SESSION_NOT_FOUND', message: 'Session was not found' });
  });
}
