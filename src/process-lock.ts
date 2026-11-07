import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

interface LockPayload {
  pid: number;
  token: string;
  createdAt: string;
}

export interface ProcessLockOptions {
  timeoutMs?: number;
  staleMs?: number;
  retryMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processExists(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readLock(lockPath: string): Promise<LockPayload | null> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, 'utf-8')) as Partial<LockPayload>;
    if (
      typeof parsed.pid !== 'number' ||
      typeof parsed.token !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }
    return parsed as LockPayload;
  } catch {
    return null;
  }
}

async function acquireOne(
  lockPath: string,
  options: Required<ProcessLockOptions>
): Promise<string> {
  const deadline = Date.now() + options.timeoutMs;
  const token = randomUUID();
  const payload: LockPayload = {
    pid: process.pid,
    token,
    createdAt: new Date().toISOString(),
  };

  await mkdir(dirname(lockPath), { recursive: true });
  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify(payload), 'utf-8');
      } finally {
        await handle.close();
      }
      return token;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readLock(lockPath);
      const ageMs = existing
        ? Date.now() - new Date(existing.createdAt).getTime()
        : Number.POSITIVE_INFINITY;
      const ownerAlive = existing ? processExists(existing.pid) : false;
      if (!existing || (!ownerAlive && ageMs >= 0) || ageMs > options.staleMs) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`等待安装锁超时：${lockPath}`);
      }
      await sleep(options.retryMs);
    }
  }
}

async function releaseOne(lockPath: string, token: string): Promise<void> {
  const current = await readLock(lockPath);
  if (current?.token === token) {
    await unlink(lockPath).catch(() => {});
  }
}

/**
 * 按规范化资源路径的字节序一次性获取全部 sidecar lock，再执行操作。
 * 释放顺序为获取顺序的反向；所有调用方遵循同一顺序可避免多目标死锁。
 */
export async function withProcessLocks<T>(
  resources: string[],
  operation: () => Promise<T>,
  options: ProcessLockOptions = {}
): Promise<T> {
  const resolved: Required<ProcessLockOptions> = {
    timeoutMs: options.timeoutMs ?? 30_000,
    staleMs: options.staleMs ?? 5 * 60_000,
    retryMs: options.retryMs ?? 25,
  };
  const ordered = [...new Set(resources)]
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map((resource) => `${resource}.lock`);
  const acquired: Array<{ path: string; token: string }> = [];

  try {
    for (const lockPath of ordered) {
      acquired.push({ path: lockPath, token: await acquireOne(lockPath, resolved) });
    }
    return await operation();
  } finally {
    for (const lock of [...acquired].reverse()) {
      await releaseOne(lock.path, lock.token);
    }
  }
}
