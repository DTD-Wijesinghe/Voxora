export type AuthRole = 'admin' | 'user';

export interface AuthUser {
  role: AuthRole;
  email: string;
  displayName: string;
  expiresAt: number;
}

const tokens = new Map<string, AuthUser>();
const registeredUsers = new Map<string, { password: string; displayName: string }>();
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export function issueToken(user: Omit<AuthUser, 'expiresAt'>): { token: string; user: AuthUser } {
  const authUser = { ...user, expiresAt: Date.now() + TOKEN_TTL_MS };
  const token = crypto.randomUUID();
  tokens.set(token, authUser);
  return { token, user: authUser };
}

export function getUserFromToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const user = tokens.get(token);
  if (!user || user.expiresAt <= Date.now()) {
    if (user) tokens.delete(token);
    return null;
  }
  return user;
}

export function revokeToken(token: string | undefined): void {
  if (token) tokens.delete(token);
}

export function registerUser(email: string, password: string, displayName: string): { token: string; user: AuthUser } {
  registeredUsers.set(email, { password, displayName });
  return issueToken({ role: 'user', email, displayName });
}

export function isRegisteredUser(email: string, password: string): { displayName: string } | null {
  const user = registeredUsers.get(email);
  return user && user.password === password ? { displayName: user.displayName } : null;
}

export function hasRegisteredUser(email: string): boolean {
  return registeredUsers.has(email);
}
