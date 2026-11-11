import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getUserFromToken, issueToken, revokeToken, type AuthRole } from './store.js';

interface LoginBody {
  email: string;
  password: string;
  displayName?: string;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = getUserFromToken(bearerToken(request));
  if (!user || user.role !== 'admin') {
    void reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Admin login is required.' });
    return false;
  }
  return true;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const { email, password, displayName } = request.body ?? {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const userEmail = process.env.USER_EMAIL?.trim().toLowerCase();
    const isAdmin = normalizedEmail === adminEmail && password === process.env.ADMIN_PASSWORD;
    const isUser = normalizedEmail === userEmail && password === process.env.USER_PASSWORD;
    const role: AuthRole = isAdmin ? 'admin' : 'user';

    if (!normalizedEmail || !password || (!isAdmin && !isUser)) {
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    }

    const auth = issueToken({
      role,
      email: normalizedEmail,
      displayName: role === 'admin' ? 'Voxora Administrator' : (displayName?.trim() || normalizedEmail.split('@')[0] || 'Voxora User'),
    });
    return reply.send(auth);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    revokeToken(bearerToken(request));
    return reply.code(204).send();
  });
}
