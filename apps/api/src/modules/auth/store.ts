import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readPersistent, writePersistent } from '../../storage/persistent-store.js';

export type AuthRole = 'admin' | 'user';
export interface AuthUser { role: AuthRole; email: string; displayName: string; expiresAt: number; }

const tokens = new Map<string, AuthUser>();
const registeredUsers = new Map<string, { passwordHash: string; displayName: string }>();
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const scrypt = promisify(scryptCallback);
const useDynamoDb = process.env.AUTH_STORAGE === 'dynamodb';
const usersTable = process.env.VOXORA_USERS_TABLE ?? 'voxora-users';
const dynamo = useDynamoDb ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
interface UserRecord { email: string; displayName: string; passwordHash: string; createdAt: string; }
const storedUserRecords = readPersistent<UserRecord[]>('users.json', []);
for (const record of storedUserRecords) registeredUsers.set(record.email, { passwordHash: record.passwordHash, displayName: record.displayName });

function persistRegisteredUsers(): void {
  writePersistent('users.json', Array.from(registeredUsers.entries()).map(([email, user]) => ({
    email,
    displayName: user.displayName,
    passwordHash: user.passwordHash,
    createdAt: new Date().toISOString(),
  })));
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, storedHex] = encoded.split(':');
  if (!salt || !storedHex) return false;
  const expected = Buffer.from(storedHex, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function issueToken(user: Omit<AuthUser, 'expiresAt'>): { token: string; user: AuthUser } {
  const authUser = { ...user, expiresAt: Date.now() + TOKEN_TTL_MS };
  const token = crypto.randomUUID();
  tokens.set(token, authUser);
  return { token, user: authUser };
}

export function getUserFromToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const user = tokens.get(token);
  if (!user || user.expiresAt <= Date.now()) { if (user) tokens.delete(token); return null; }
  return user;
}

export function revokeToken(token: string | undefined): void { if (token) tokens.delete(token); }

export async function registerUser(email: string, password: string, displayName: string): Promise<{ token: string; user: AuthUser }> {
  const passwordHash = await hashPassword(password);
  if (useDynamoDb && dynamo) {
    const record: UserRecord = { email, displayName, passwordHash, createdAt: new Date().toISOString() };
    await dynamo.send(new PutCommand({ TableName: usersTable, Item: record, ConditionExpression: 'attribute_not_exists(email)' }));
  } else { registeredUsers.set(email, { passwordHash, displayName }); persistRegisteredUsers(); }
  return issueToken({ role: 'user', email, displayName });
}

export async function isRegisteredUser(email: string, password: string): Promise<{ displayName: string } | null> {
  const user = useDynamoDb && dynamo
    ? (await dynamo.send(new GetCommand({ TableName: usersTable, Key: { email } }))).Item as UserRecord | undefined
    : (() => { const local = registeredUsers.get(email); return local ? { email, displayName: local.displayName, passwordHash: local.passwordHash, createdAt: '' } : undefined; })();
  return user && await verifyPassword(password, user.passwordHash) ? { displayName: user.displayName } : null;
}

export async function hasRegisteredUser(email: string): Promise<boolean> {
  if (useDynamoDb && dynamo) {
    const result = await dynamo.send(new GetCommand({ TableName: usersTable, Key: { email }, ProjectionExpression: 'email' }));
    return Boolean(result.Item);
  }
  return registeredUsers.has(email);
}

export async function deleteRegisteredUser(email: string): Promise<void> {
  if (useDynamoDb && dynamo) await dynamo.send(new DeleteCommand({ TableName: usersTable, Key: { email } }));
  else { registeredUsers.delete(email); persistRegisteredUsers(); }
}
