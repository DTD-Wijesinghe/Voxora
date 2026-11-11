import type { AdminSession } from '@voxora/contracts';
export type { AdminSession };
export type { CreateAdminSessionRequest, UpdateAdminSessionRequest, SessionStatus } from '@voxora/contracts';

export const adminSessions = new Map<string, AdminSession>();
