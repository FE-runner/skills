import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const rootDir = join(import.meta.dirname, '..');
const describePublishDev = platform() === 'win32' ? describe.skip : describe;

describePublishDev('publish-dev.sh', () => {
  let testDir: string | undefined;

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
      testDir = undefined;
    }
  });

  it('treats pnpm separator plus --dry-run as a preflight', () => {
    testDir = mkdtempSync(join(tmpdir(), 'skills-publish-dev-test-'));
    const mockBin = join(testDir, 'bin');
    const callLog = join(testDir, 'calls.log');
    mkdirSync(mockBin);

    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ version: '1.4.7-bmc1.7.1' }),
      'utf-8'
    );
    copyFileSync(join(rootDir, 'scripts', 'publish-dev.sh'), join(testDir, 'publish-dev.sh'));

    const gitStub = `#!/usr/bin/env bash
printf 'git %s\\n' "$*" >> "$CALL_LOG"
if [[ "$1" == "branch" && "$2" == "--show-current" ]]; then
  printf 'develop\\n'
fi
exit 0
`;
    const gitPath = join(mockBin, 'git');
    writeFileSync(gitPath, gitStub, 'utf-8');
    chmodSync(gitPath, 0o755);

    const npmStub = `#!/usr/bin/env bash
printf 'npm %s\\n' "$*" >> "$CALL_LOG"
exit 1
`;
    const npmPath = join(mockBin, 'npm');
    writeFileSync(npmPath, npmStub, 'utf-8');
    chmodSync(npmPath, 0o755);

    const result = spawnSync('bash', ['publish-dev.sh', '--', '--dry-run'], {
      cwd: testDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${mockBin}:${process.env.PATH ?? ''}`,
        CALL_LOG: callLog,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('dry-run: 预检通过，未创建或推送标签。');

    const calls = existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '';
    expect(calls).not.toMatch(/^git tag /m);
    expect(calls).not.toMatch(/^git push /m);
  });
});
