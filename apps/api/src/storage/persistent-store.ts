import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  email?: string;
  sessionId?: string;
  metadata?: Record<string, string | number | boolean>;
}

const dataDirectory = process.env.VOXORA_DATA_DIR
  ?? (process.env.NODE_ENV === 'production' ? '/var/lib/voxora' : resolve(process.cwd(), '.data'));

function ensureDataDirectory(): void {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  try { chmodSync(dataDirectory, 0o700); } catch { /* Windows or restricted filesystem. */ }
}

export function readPersistent<T>(fileName: string, fallback: T): T {
  ensureDataDirectory();
  const filePath = join(dataDirectory, fileName);
  if (!existsSync(filePath)) return fallback;
  try { return JSON.parse(readFileSync(filePath, 'utf8')) as T; } catch { return fallback; }
}

export function writePersistent<T>(fileName: string, value: T): void {
  ensureDataDirectory();
  const filePath = join(dataDirectory, fileName);
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    renameSync(temporaryPath, filePath);
  } catch {
    // Windows does not replace an existing destination with renameSync.
    try { unlinkSync(filePath); } catch { /* The destination may not exist yet. */ }
    renameSync(temporaryPath, filePath);
  }
  try { chmodSync(filePath, 0o600); } catch { /* Windows or restricted filesystem. */ }
}

export function appendAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  const current = readPersistent<AuditEntry[]>('audit-log.json', []);
  current.push({ ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
  writePersistent('audit-log.json', current.slice(-5000));
}

export function readAudit(limit = 100): AuditEntry[] {
  return readPersistent<AuditEntry[]>('audit-log.json', []).slice(-limit).reverse();
}
