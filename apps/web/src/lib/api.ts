import type { CreateSessionRequest, Session } from '@voxora/contracts';
import type { JoinResult } from '../types';

export interface AuthSession { token: string; user: { role: 'admin' | 'user'; email: string; displayName: string; expiresAt: number }; }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:3000`;

export async function login(input: { email: string; password: string; displayName?: string }): Promise<AuthSession> {
  return request<AuthSession>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export async function register(input: { email: string; password: string; displayName: string }): Promise<AuthSession> {
  return request<AuthSession>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export async function logout(token: string): Promise<void> {
  await request<void>('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json() as Promise<T>;
}

function createMockSession(input: CreateSessionRequest, joinCode = 'VOXORA'): Session {
  return {
    id: crypto.randomUUID(),
    joinCode,
    status: 'live',
    participants: [{ id: crypto.randomUUID(), displayName: input.displayName, targetLanguage: input.targetLanguage, isHost: true }],
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

export async function createSession(input: CreateSessionRequest): Promise<JoinResult> {
  try {
    return { session: await request<Session>('/api/sessions', { method: 'POST', body: JSON.stringify(input) }), isMock: false };
  } catch {
    return { session: createMockSession(input), isMock: true };
  }
}

export async function joinSession(input: CreateSessionRequest & { joinCode: string }): Promise<JoinResult> {
  try {
    const session = await request<Session>(`/api/sessions/${encodeURIComponent(input.joinCode)}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName: input.displayName, targetLanguage: input.targetLanguage }),
    });
    return { session, isMock: false };
  } catch (error) {
    console.warn('API join session failed, falling back to local session:', error);
    return { session: createMockSession(input, input.joinCode.toUpperCase()), isMock: true };
  }
}

// Provisional until the backend exposes a participant-preference endpoint.
export async function updateLanguage(_sessionId: string, _language: string): Promise<void> {
  return Promise.resolve();
}

