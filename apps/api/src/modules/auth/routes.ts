import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getUserFromToken, hasRegisteredUser, isRegisteredUser, issueToken, registerUser, revokeToken, type AuthRole } from './store.js';

interface LoginBody {
  email: string;
  password: string;
  displayName?: string;
}

interface RegisterBody { email: string; password: string; displayName: string; }

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
    const registeredUser = isRegisteredUser(normalizedEmail, password);
    const isUser = (normalizedEmail === userEmail && password === process.env.USER_PASSWORD) || registeredUser !== null;
    const role: AuthRole = isAdmin ? 'admin' : 'user';

    if (!normalizedEmail || !password || (!isAdmin && !isUser)) {
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    }

    const auth = issueToken({
      role,
      email: normalizedEmail,
      displayName: role === 'admin' ? 'Voxora Administrator' : (registeredUser?.displayName || displayName?.trim() || normalizedEmail.split('@')[0] || 'Voxora User'),
    });
    return reply.send(auth);
  });

  app.post<{ Body: RegisterBody }>('/api/auth/register', async (request, reply) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = request.body?.password;
    const displayName = typeof request.body?.displayName === 'string' ? request.body.displayName.trim() : '';
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const userEmail = process.env.USER_EMAIL?.trim().toLowerCase();
    if (!email.includes('@') || typeof password !== 'string' || password.length < 8 || displayName.length < 1 || displayName.length > 40) {
      return reply.code(400).send({ code: 'INVALID_REGISTRATION', message: 'Enter a valid name, email, and password of at least 8 characters.' });
    }
    if (email === adminEmail || email === userEmail || hasRegisteredUser(email)) {
      return reply.code(409).send({ code: 'ACCOUNT_EXISTS', message: 'An account with this email already exists.' });
    }
    return reply.code(201).send(registerUser(email, password, displayName));
  });

  app.post('/api/auth/logout', async (request, reply) => {
    revokeToken(bearerToken(request));
    return reply.code(204).send();
  });
}
