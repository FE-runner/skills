import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { withProcessLocks } from './process-lock.ts';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('withProcessLocks', () => {
  it('同一资源串行执行', async () => {
    let active = 0;
    let maxActive = 0;
    const dir = await mkdtemp(join(tmpdir(), 'skills-lock-'));
    tempDirs.push(dir);
    const resource = join(dir, 'shared');
    await Promise.all(
      [1, 2].map(() =>
        withProcessLocks([resource], async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active -= 1;
        })
      )
    );
    expect(maxActive).toBe(1);
  });

  it('不同输入顺序按稳定顺序获取，不死锁', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-lock-order-'));
    tempDirs.push(dir);
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    const events: string[] = [];
    await Promise.all([
      withProcessLocks([b, a], async () => {
        events.push('first');
      }),
      withProcessLocks([a, b], async () => {
        events.push('second');
      }),
    ]);
    expect(events.sort()).toEqual(['first', 'second']);
  });

  it('持锁进程已退出时可接管', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-lock-stale-'));
    tempDirs.push(dir);
    const resource = join(dir, 'stale');
    await writeFile(
      `${resource}.lock`,
      JSON.stringify({ pid: 999999, token: 'stale', createdAt: new Date().toISOString() })
    );
    await expect(withProcessLocks([resource], async () => 'ok')).resolves.toBe('ok');
    await expect(readFile(`${resource}.lock`, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
