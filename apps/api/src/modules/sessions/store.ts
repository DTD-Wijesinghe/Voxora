import type { AdminSession } from '@voxora/contracts';
import { readPersistent, writePersistent } from '../../storage/persistent-store.js';
export type { AdminSession };
export type { CreateAdminSessionRequest, UpdateAdminSessionRequest, SessionStatus, SessionMode } from '@voxora/contracts';

export const adminSessions = new Map<string, AdminSession>(
  readPersistent<AdminSession[]>('sessions.json', []).map((session) => [session.id, session]),
);

export function persistAdminSessions(): void {
  writePersistent('sessions.json', Array.from(adminSessions.values()));
}
