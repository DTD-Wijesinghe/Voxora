import type { CreateSessionRequest, Session } from '@voxora/contracts';
import type { JoinResult } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:3000`;

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

// Provisional adapter: the current backend has no agreed join-session endpoint.
export async function joinSession(input: CreateSessionRequest & { joinCode: string }): Promise<JoinResult> {
  return { session: createMockSession(input, input.joinCode.toUpperCase()), isMock: true };
}

// Provisional until the backend exposes a participant-preference endpoint.
export async function updateLanguage(_sessionId: string, _language: string): Promise<void> {
  return Promise.resolve();
}

