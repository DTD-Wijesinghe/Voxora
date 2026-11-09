import type { FastifyInstance } from 'fastify';
import type { CreateSessionRequest, Session } from '@voxora/contracts';

const sessions = new Map<string, Session>();

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
    const session = sessions.get(request.params.id);
    if (!session) return reply.code(404).send({ code: 'SESSION_NOT_FOUND', message: 'Session was not found' });
    return session;
  });
}

