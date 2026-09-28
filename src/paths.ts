import { homedir } from 'os';
import { join } from 'path';
import { AGENTS_DIR } from './constants.ts';

/**
 * 凭证目录：`~/.blueai`。开发版与正式版构建使用同一路径。
 */
export function getCredentialDir(): string {
  return join(homedir(), '.blueai');
}

/**
 * 全局 skill 锁路径：`$XDG_STATE_HOME/skills/.skill-lock.json` 优先，
 * 否则回退 `~/.agents/.skill-lock.json`。开发版与正式版构建使用同一路径。
 */
export function getGlobalSkillLockPath(): string {
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome) {
    return join(xdgStateHome, 'skills', '.skill-lock.json');
  }
  return join(homedir(), AGENTS_DIR, '.skill-lock.json');
}
