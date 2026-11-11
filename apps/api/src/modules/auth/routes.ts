import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getUserFromToken, hasRegisteredUser, isRegisteredUser, issueToken, registerUser, revokeToken, type AuthRole } from './store.js';
import { appendAudit } from '../../storage/persistent-store.js';

interface LoginBody {
  email: string;
  password: string;
  displayName?: string;
}

interface RegisterBody { email: string; password: string; displayName: string; }
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 10;

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
    const attemptKey = `${request.ip}:${normalizedEmail}`;
    const previousFailures = loginFailures.get(attemptKey);
    if (previousFailures && previousFailures.resetAt > Date.now() && previousFailures.count >= MAX_LOGIN_FAILURES) {
      return reply.code(429).send({ code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed login attempts. Try again later.' });
    }
    const isAdmin = normalizedEmail === adminEmail && password === process.env.ADMIN_PASSWORD;
    const registeredUser = await isRegisteredUser(normalizedEmail, password);
    const isUser = (normalizedEmail === userEmail && password === process.env.USER_PASSWORD) || registeredUser !== null;
    const role: AuthRole = isAdmin ? 'admin' : 'user';

    if (!normalizedEmail || !password || (!isAdmin && !isUser)) {
      const current = previousFailures && previousFailures.resetAt > Date.now() ? previousFailures : { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS };
      loginFailures.set(attemptKey, { count: current.count + 1, resetAt: current.resetAt });
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    }
    loginFailures.delete(attemptKey);

    const auth = issueToken({
      role,
      email: normalizedEmail,
      displayName: role === 'admin' ? 'Voxora Administrator' : (registeredUser?.displayName || displayName?.trim() || normalizedEmail.split('@')[0] || 'Voxora User'),
    });
    appendAudit({ action: 'auth.login', email: normalizedEmail, metadata: { role } });
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
    if (email === adminEmail || email === userEmail || await hasRegisteredUser(email)) {
      return reply.code(409).send({ code: 'ACCOUNT_EXISTS', message: 'An account with this email already exists.' });
    }
    const auth = await registerUser(email, password, displayName);
    appendAudit({ action: 'auth.registered', email, metadata: { role: 'user' } });
    return reply.code(201).send(auth);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    revokeToken(bearerToken(request));
    appendAudit({ action: 'auth.logout' });
    return reply.code(204).send();
  });
}
