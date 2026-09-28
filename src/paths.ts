import { homedir } from 'os';
import { join } from 'path';
import { AGENTS_DIR } from './constants.ts';

/**
 * 构建期注入的 dev 标记。
 * dev 构建由 build.config.mjs 通过 rolldown define 注入为 '1'；正式构建不注入。
 */
const DEV_BUILD = process.env.BLUEAI_SKILLS_DEV_BUILD === '1';

/**
 * 解析隔离开关的显式假值。
 * 返回 undefined 表示变量未设置或为空白，取构建期默认；false 表示显式关闭；true 表示显式开启。
 */
function parseDevFlag(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === '') return undefined;
  if (value === '0' || value === 'false') return false;
  return true;
}

/**
 * 是否启用开发隔离模式。
 *
 * 构建期标记是上限：正式构建永远关闭（忽略 BLUEAI_SKILLS_DEV）；开发构建默认开启，
 * 可用显式假值（0 / false，大小写不敏感）关闭。
 */
export const IS_DEV_ISOLATION = DEV_BUILD && (parseDevFlag(process.env.BLUEAI_SKILLS_DEV) ?? true);

/** 真实用户 home，供 LoongSuite Pilot 等不参与隔离的路径使用。 */
export function getRealHome(): string {
  return homedir();
}

/**
 * 隔离模式下的状态根；未启用隔离时返回真实 home，且忽略 BLUEAI_SKILLS_HOME。
 */
export function getStateRoot(): string {
  if (!IS_DEV_ISOLATION) return homedir();
  return process.env.BLUEAI_SKILLS_HOME?.trim() || join(homedir(), '.blueai-skills-dev');
}

/**
 * 凭证目录：正式构建为 `~/.blueai`；开发隔离模式为状态根。
 */
export function getCredentialDir(): string {
  return IS_DEV_ISOLATION ? getStateRoot() : join(homedir(), '.blueai');
}

/**
 * 当前生效的全局 skill 锁路径。
 *
 * 隔离模式固定落在状态根下并忽略 XDG_STATE_HOME；未启用隔离时保留
 * `$XDG_STATE_HOME/skills/.skill-lock.json` 的既有优先行为。
 */
export function getGlobalSkillLockPath(): string {
  if (IS_DEV_ISOLATION) {
    return join(getStateRoot(), AGENTS_DIR, '.skill-lock.json');
  }
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome) {
    return join(xdgStateHome, 'skills', '.skill-lock.json');
  }
  return join(homedir(), AGENTS_DIR, '.skill-lock.json');
}

/**
 * 全局安装基准目录：正式构建为真实 home；开发隔离模式为状态根。
 */
export function getGlobalBaseDir(): string {
  return IS_DEV_ISOLATION ? getStateRoot() : homedir();
}
