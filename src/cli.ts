#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { basename, join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { runAdd, parseAddOptions, initTelemetry } from './add.ts';
import { runFind } from './find.ts';
import { runInstallFromLock } from './install.ts';
import { runList } from './list.ts';
import { removeCommand, parseRemoveOptions } from './remove.ts';
import { runSync, parseSyncOptions } from './sync.ts';
import { track } from './telemetry.ts';
import { readLocalLock } from './local-lock.ts';
import { fetchSkillFolderHash, getGitHubToken } from './skill-lock.ts';
import { marketProvider } from './providers/market.ts';
import { buildUpdateInstallSource, formatSourceInput } from './update-source.ts';
import {
  NPX_CMD,
  BIN_NAME,
  USAGE_CMD,
  PACKAGE_NAME,
  EXAMPLE_REPO,
  SKILLS_SITE,
} from './branding.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const VERSION = getVersion();
initTelemetry(VERSION);

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
// 256-color grays - visible on both light and dark backgrounds
const DIM = '\x1b[38;5;102m'; // darker gray for secondary text
const TEXT = '\x1b[38;5;145m'; // lighter gray for primary text

const LOGO_LINES = [
  '███████╗██╗  ██╗██╗██╗     ██╗     ███████╗',
  '██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝',
  '███████╗█████╔╝ ██║██║     ██║     ███████╗',
  '╚════██║██╔═██╗ ██║██║     ██║     ╚════██║',
  '███████║██║  ██╗██║███████╗███████╗███████║',
  '╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝',
];

// 256-color middle grays - visible on both light and dark backgrounds
const GRAYS = [
  '\x1b[38;5;250m', // lighter gray
  '\x1b[38;5;248m',
  '\x1b[38;5;245m', // mid gray
  '\x1b[38;5;243m',
  '\x1b[38;5;240m',
  '\x1b[38;5;238m', // darker gray
];

function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i]}${line}${RESET}`);
  });
}

function showBanner(): void {
  showLogo();
  console.log();
  console.log(`${DIM}The open agent skills ecosystem${RESET}`);
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} add ${DIM}<package>${RESET}        ${DIM}Add a new skill${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} remove${RESET}               ${DIM}Remove installed skills${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} list${RESET}                 ${DIM}List installed skills${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} find ${DIM}[query]${RESET}         ${DIM}Search for skills${RESET}`
  );
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} check${RESET}                ${DIM}Check for updates${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} update${RESET}               ${DIM}Update all skills${RESET}`
  );
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} experimental_install${RESET} ${DIM}Restore from skills-lock.json${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} init ${DIM}[name]${RESET}          ${DIM}Create a new skill${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}${NPX_CMD} experimental_sync${RESET}    ${DIM}Sync skills from node_modules${RESET}`
  );
  console.log();
  console.log(`${DIM}try:${RESET} ${NPX_CMD} add ${EXAMPLE_REPO}`);
  console.log();
  console.log(`Discover more skills at ${TEXT}${SKILLS_SITE}/${RESET}`);
  console.log();
}

function showHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} ${USAGE_CMD}

${BOLD}Manage Skills:${RESET}
  add <package>        Add a skill package (alias: a)
                       e.g. ${EXAMPLE_REPO}
                            <authorId>/<skill-name>
  remove [skills]      Remove installed skills
  list, ls             List installed skills
  find [query]         Search for skills interactively

${BOLD}Updates:${RESET}
  check                Check for available skill updates
  update               Update all skills to latest versions

${BOLD}Project:${RESET}
  experimental_install Restore skills from skills-lock.json
  init [name]          Initialize a skill (creates <name>/SKILL.md or ./SKILL.md)
  experimental_sync    Sync skills from node_modules into agent directories

${BOLD}Add Options:${RESET}
  -g, --global           Install skill globally (user-level) instead of project-level
  -a, --agent <agents>   Specify agents to install to (use '*' for all agents)
  -s, --skill <skills>   Specify skill names to install (use '*' for all skills)
  -l, --list             List available skills in the repository without installing
  -y, --yes              Skip confirmation prompts
  --copy                 Copy files instead of symlinking to agent directories
  --all                  Shorthand for --skill '*' --agent '*' -y
  --full-depth           Search all subdirectories even when a root SKILL.md exists

${BOLD}Remove Options:${RESET}
  -g, --global           Remove from global scope
  -a, --agent <agents>   Remove from specific agents (use '*' for all agents)
  -s, --skill <skills>   Specify skills to remove (use '*' for all skills)
  -y, --yes              Skip confirmation prompts
  --all                  Shorthand for --skill '*' --agent '*' -y

${BOLD}Experimental Sync Options:${RESET}
  -a, --agent <agents>   Specify agents to install to (use '*' for all agents)
  -y, --yes              Skip confirmation prompts

${BOLD}List Options:${RESET}
  -g, --global           List global skills (default: project)
  -a, --agent <agents>   Filter by specific agents
  --json                 Output as JSON (machine-readable, no ANSI codes)

${BOLD}Options:${RESET}
  --help, -h        Show this help message
  --version, -v     Show version number

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} ${BIN_NAME} add ${EXAMPLE_REPO}
  ${DIM}$${RESET} ${BIN_NAME} add ${EXAMPLE_REPO} -g
  ${DIM}$${RESET} ${BIN_NAME} add ${EXAMPLE_REPO} --agent claude-code cursor
  ${DIM}$${RESET} ${BIN_NAME} add owner/repo --skill my-skill another-skill
  ${DIM}$${RESET} ${BIN_NAME} remove                        ${DIM}# interactive remove${RESET}
  ${DIM}$${RESET} ${BIN_NAME} remove my-skill               ${DIM}# remove by name${RESET}
  ${DIM}$${RESET} ${BIN_NAME} rm --global my-skill
  ${DIM}$${RESET} ${BIN_NAME} list                          ${DIM}# list project skills${RESET}
  ${DIM}$${RESET} ${BIN_NAME} ls -g                         ${DIM}# list global skills${RESET}
  ${DIM}$${RESET} ${BIN_NAME} ls -a claude-code             ${DIM}# filter by agent${RESET}
  ${DIM}$${RESET} ${BIN_NAME} ls --json                      ${DIM}# JSON output${RESET}
  ${DIM}$${RESET} ${BIN_NAME} find                          ${DIM}# interactive search${RESET}
  ${DIM}$${RESET} ${BIN_NAME} find typescript               ${DIM}# search by keyword${RESET}
  ${DIM}$${RESET} ${BIN_NAME} check
  ${DIM}$${RESET} ${BIN_NAME} update
  ${DIM}$${RESET} ${BIN_NAME} experimental_install            ${DIM}# restore from skills-lock.json${RESET}
  ${DIM}$${RESET} ${BIN_NAME} init my-skill
  ${DIM}$${RESET} ${BIN_NAME} experimental_sync              ${DIM}# sync from node_modules${RESET}
  ${DIM}$${RESET} ${BIN_NAME} experimental_sync -y           ${DIM}# sync without prompts${RESET}

Discover more skills at ${TEXT}${SKILLS_SITE}/${RESET}
`);
}

function showRemoveHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} ${BIN_NAME} remove [skills...] [options]

${BOLD}Description:${RESET}
  Remove installed skills from agents. If no skill names are provided,
  an interactive selection menu will be shown.

${BOLD}Arguments:${RESET}
  skills            Optional skill names to remove (space-separated)

${BOLD}Options:${RESET}
  -g, --global       Remove from global scope (~/) instead of project scope
  -a, --agent        Remove from specific agents (use '*' for all agents)
  -s, --skill        Specify skills to remove (use '*' for all skills)
  -y, --yes          Skip confirmation prompts
  --all              Shorthand for --skill '*' --agent '*' -y

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} ${BIN_NAME} remove                           ${DIM}# interactive selection${RESET}
  ${DIM}$${RESET} ${BIN_NAME} remove my-skill                   ${DIM}# remove specific skill${RESET}
  ${DIM}$${RESET} ${BIN_NAME} remove skill1 skill2 -y           ${DIM}# remove multiple skills${RESET}
  ${DIM}$${RESET} ${BIN_NAME} remove --global my-skill          ${DIM}# remove from global scope${RESET}
  ${DIM}$${RESET} ${BIN_NAME} rm --agent claude-code my-skill   ${DIM}# remove from specific agent${RESET}
  ${DIM}$${RESET} ${BIN_NAME} remove --all                      ${DIM}# remove all skills${RESET}
  ${DIM}$${RESET} ${BIN_NAME} remove --skill '*' -a cursor      ${DIM}# remove all skills from cursor${RESET}

Discover more skills at ${TEXT}${SKILLS_SITE}/${RESET}
`);
}

function runInit(args: string[]): void {
  const cwd = process.cwd();
  const skillName = args[0] || basename(cwd);
  const hasName = args[0] !== undefined;

  const skillDir = hasName ? join(cwd, skillName) : cwd;
  const skillFile = join(skillDir, 'SKILL.md');
  const displayPath = hasName ? `${skillName}/SKILL.md` : 'SKILL.md';

  if (existsSync(skillFile)) {
    console.log(`${TEXT}Skill already exists at ${DIM}${displayPath}${RESET}`);
    return;
  }

  if (hasName) {
    mkdirSync(skillDir, { recursive: true });
  }

  const skillContent = `---
name: ${skillName}
description: A brief description of what this skill does
---

# ${skillName}

Instructions for the agent to follow when this skill is activated.

## When to use

Describe when this skill should be used.

## Instructions

1. First step
2. Second step
3. Additional steps as needed
`;

  writeFileSync(skillFile, skillContent);

  console.log(`${TEXT}Initialized skill: ${DIM}${skillName}${RESET}`);
  console.log();
  console.log(`${DIM}Created:${RESET}`);
  console.log(`  ${displayPath}`);
  console.log();
  console.log(`${DIM}Next steps:${RESET}`);
  console.log(`  1. Edit ${TEXT}${displayPath}${RESET} to define your skill instructions`);
  console.log(
    `  2. Update the ${TEXT}name${RESET} and ${TEXT}description${RESET} in the frontmatter`
  );
  console.log();
  console.log(`${DIM}Publishing:${RESET}`);
  console.log(
    `  ${DIM}GitHub:${RESET}  Push to a repo, then ${TEXT}${NPX_CMD} add <owner>/<repo>${RESET}`
  );
  console.log(
    `  ${DIM}URL:${RESET}     Host the file, then ${TEXT}${NPX_CMD} add https://example.com/${displayPath}${RESET}`
  );
  console.log();
  console.log(`Browse existing skills for inspiration at ${TEXT}${SKILLS_SITE}/${RESET}`);
  console.log();
}

// ============================================
// Check and Update Commands
// ============================================

const AGENTS_DIR = '.agents';
const LOCK_FILE = '.skill-lock.json';
const CURRENT_LOCK_VERSION = 3; // Bumped from 2 to 3 for folder hash support

interface SkillLockEntry {
  source: string;
  sourceType: string;
  sourceUrl: string;
  ref?: string;
  skillPath?: string;
  /** GitHub tree SHA for the entire skill folder (v3) */
  skillFolderHash: string;
  /** Installed version (market skills only) */
  version?: string;
  /** Market skill author ID for private skill verification */
  authorId?: string;
  installedAt: string;
  updatedAt: string;
}

interface SkillLockFile {
  version: number;
  skills: Record<string, SkillLockEntry>;
}

function getSkillLockPath(): string {
  // 支持 XDG_STATE_HOME（上游改进）
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome) {
    return join(xdgStateHome, 'skills', LOCK_FILE);
  }
  return join(homedir(), AGENTS_DIR, LOCK_FILE);
}

function readSkillLock(): SkillLockFile {
  const lockPath = getSkillLockPath();
  try {
    const content = readFileSync(lockPath, 'utf-8');
    const parsed = JSON.parse(content) as SkillLockFile;
    if (typeof parsed.version !== 'number' || !parsed.skills) {
      return { version: CURRENT_LOCK_VERSION, skills: {} };
    }
    // If old version, wipe and start fresh (backwards incompatible change)
    // v3 adds skillFolderHash - we want fresh installs to populate it
    if (parsed.version < CURRENT_LOCK_VERSION) {
      return { version: CURRENT_LOCK_VERSION, skills: {} };
    }
    return parsed;
  } catch {
    return { version: CURRENT_LOCK_VERSION, skills: {} };
  }
}

// ============================================
// 上游改进：跳过的技能提示（无法自动检查更新的技能）
// ============================================

interface SkippedSkill {
  name: string;
  reason: string;
  sourceUrl: string;
  ref?: string;
}

/**
 * 判断为什么一个技能无法自动检查更新。
 */
function getSkipReason(entry: SkillLockEntry): string {
  if (entry.sourceType === 'local') {
    return 'Local path';
  }
  if (entry.sourceType === 'git') {
    return 'Git URL (hash tracking not supported)';
  }
  if (!entry.skillFolderHash) {
    return 'No version hash available';
  }
  if (!entry.skillPath) {
    return 'No skill path recorded';
  }
  return 'No version tracking';
}

/**
 * 打印无法自动检查更新的技能列表，附带原因和手动更新命令。
 */
function printSkippedSkills(skipped: SkippedSkill[]): void {
  if (skipped.length === 0) return;
  console.log();
  console.log(`${DIM}${skipped.length} skill(s) cannot be checked automatically:${RESET}`);
  for (const skill of skipped) {
    console.log(`  ${TEXT}•${RESET} ${skill.name} ${DIM}(${skill.reason})${RESET}`);
    console.log(
      `    ${DIM}To update: ${TEXT}${NPX_CMD} add ${formatSourceInput(skill.sourceUrl, skill.ref)} -g -y${RESET}`
    );
  }
}

async function runCheck(args: string[] = []): Promise<void> {
  const isGlobal = args.includes('-g') || args.includes('--global');

  console.log(`${TEXT}Checking for skill updates...${RESET}`);
  console.log();

  const updates: Array<{ name: string; source: string }> = [];
  const errors: Array<{ name: string; source: string; error: string }> = [];
  let totalSkills = 0;

  if (isGlobal) {
    // 全局模式：检查全局 lock（GitHub + market 技能）
    const lock = readSkillLock();
    const token = getGitHubToken();

    const githubSkills = new Map<string, Array<{ name: string; entry: SkillLockEntry }>>();
    const marketSkills: Array<{ name: string; entry: SkillLockEntry }> = [];
    const skipped: SkippedSkill[] = [];

    for (const [skillName, entry] of Object.entries(lock.skills)) {
      if (!entry) continue;
      if (entry.sourceType === 'market' && entry.skillPath) {
        marketSkills.push({ name: skillName, entry });
      } else if (entry.sourceType === 'github' && entry.skillFolderHash && entry.skillPath) {
        const existing = githubSkills.get(entry.source) || [];
        existing.push({ name: skillName, entry });
        githubSkills.set(entry.source, existing);
      } else {
        // 无法自动检查的技能（上游改进：提供跳过原因和手动命令）
        skipped.push({
          name: skillName,
          reason: getSkipReason(entry),
          sourceUrl: entry.sourceUrl,
          ref: entry.ref,
        });
      }
    }

    totalSkills =
      marketSkills.length + [...githubSkills.values()].reduce((sum, arr) => sum + arr.length, 0);

    for (const [source, skills] of githubSkills) {
      for (const { name, entry } of skills) {
        try {
          const latestHash = await fetchSkillFolderHash(source, entry.skillPath!, token, entry.ref);
          if (!latestHash) {
            errors.push({ name, source, error: 'Could not fetch from GitHub' });
          } else if (latestHash !== entry.skillFolderHash) {
            updates.push({ name, source });
          }
        } catch (err) {
          errors.push({
            name,
            source,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    for (const { name, entry } of marketSkills) {
      try {
        const checkResult = await marketProvider.check(entry.skillPath!, entry.authorId);
        if (!checkResult) {
          errors.push({ name, source: entry.source, error: 'Could not fetch from Skills Market' });
        } else if (checkResult.currentVersion !== entry.version) {
          updates.push({ name, source: entry.source });
        }
      } catch (err) {
        errors.push({
          name,
          source: entry.source,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (totalSkills === 0) {
      console.log(`${DIM}No skills tracked in lock file.${RESET}`);
      console.log(`${DIM}Install skills with${RESET} ${TEXT}${NPX_CMD} add <package>${RESET}`);
      printSkippedSkills(skipped);
      return;
    }

    console.log(`${DIM}Checking ${totalSkills} skill(s) for updates...${RESET}`);
    console.log();

    if (updates.length === 0) {
      console.log(`${TEXT}✓ All skills are up to date${RESET}`);
    } else {
      console.log(`${TEXT}${updates.length} update(s) available:${RESET}`);
      console.log();
      for (const update of updates) {
        console.log(`  ${TEXT}↑${RESET} ${update.name}`);
        console.log(`    ${DIM}source: ${update.source}${RESET}`);
      }
      console.log();
      console.log(
        `${DIM}Run${RESET} ${TEXT}${NPX_CMD} update -g${RESET} ${DIM}to update all skills${RESET}`
      );
    }

    if (errors.length > 0) {
      console.log();
      console.log(`${DIM}Could not check ${errors.length} skill(s) (may need reinstall)${RESET}`);
      console.log();
      for (const error of errors) {
        console.log(`  ${DIM}✗${RESET} ${error.name}`);
        console.log(`    ${DIM}source: ${error.source}${RESET}`);
      }
    }

    printSkippedSkills(skipped);
  } else {
    // 本地模式：检查本地 lock（仅 market 技能）
    const localLock = await readLocalLock();

    for (const [name, entry] of Object.entries(localLock.skills)) {
      if (entry.sourceType === 'market' && entry.skillId) {
        totalSkills++;
        try {
          const checkResult = await marketProvider.check(entry.skillId, entry.authorId);
          if (!checkResult) {
            errors.push({
              name,
              source: `market/${name}`,
              error: 'Could not fetch from Skills Market',
            });
          } else if (checkResult.currentVersion !== entry.version) {
            updates.push({ name, source: `market/${name}` });
          }
        } catch (err) {
          errors.push({
            name,
            source: `market/${name}`,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    if (totalSkills === 0) {
      console.log(`${DIM}No skills tracked in lock file.${RESET}`);
      console.log(`${DIM}Install skills with${RESET} ${TEXT}${NPX_CMD} add <package>${RESET}`);
      return;
    }

    console.log(`${DIM}Checking ${totalSkills} skill(s) for updates...${RESET}`);
    console.log();

    if (updates.length === 0) {
      console.log(`${TEXT}✓ All skills are up to date${RESET}`);
    } else {
      console.log(`${TEXT}${updates.length} update(s) available:${RESET}`);
      console.log();
      for (const update of updates) {
        console.log(`  ${TEXT}↑${RESET} ${update.name}`);
        console.log(`    ${DIM}source: ${update.source}${RESET}`);
      }
      console.log();
      console.log(
        `${DIM}Run${RESET} ${TEXT}${NPX_CMD} update${RESET} ${DIM}to update all skills${RESET}`
      );
    }

    if (errors.length > 0) {
      console.log();
      console.log(`${DIM}Could not check ${errors.length} skill(s) (may need reinstall)${RESET}`);
    }
  }

  // Track telemetry
  track({
    event: 'check',
    skillCount: String(totalSkills),
    updatesAvailable: String(updates.length),
  });

  console.log();
}

async function runUpdate(args: string[] = []): Promise<void> {
  const isGlobal = args.includes('-g') || args.includes('--global');

  console.log(`${TEXT}Checking for skill updates...${RESET}`);
  console.log();

  const updates: Array<{ name: string; installUrl: string }> = [];
  let checkedCount = 0;

  if (isGlobal) {
    // 全局模式：检查全局 lock
    const lock = readSkillLock();
    const token = getGitHubToken();
    const skipped: SkippedSkill[] = [];

    for (const [skillName, entry] of Object.entries(lock.skills)) {
      if (!entry) continue;

      if (entry.sourceType === 'market' && entry.skillPath) {
        checkedCount++;
        try {
          const checkResult = await marketProvider.check(entry.skillPath, entry.authorId);
          if (checkResult && checkResult.currentVersion !== entry.version) {
            const installUrl = entry.source.replace('market/', '');
            updates.push({ name: skillName, installUrl });
          }
        } catch {
          // 跳过检查失败的技能
        }
      } else if (entry.sourceType === 'github' && entry.skillFolderHash && entry.skillPath) {
        checkedCount++;
        try {
          const latestHash = await fetchSkillFolderHash(
            entry.source,
            entry.skillPath,
            token,
            entry.ref
          );
          if (latestHash && latestHash !== entry.skillFolderHash) {
            // 使用上游 buildUpdateInstallSource 构建安装源（支持 ref 和 subpath）
            const installUrl = buildUpdateInstallSource(entry);
            updates.push({ name: skillName, installUrl });
          }
        } catch {
          // 跳过检查失败的技能
        }
      } else {
        // 无法自动检查的技能
        skipped.push({
          name: skillName,
          reason: getSkipReason(entry),
          sourceUrl: entry.sourceUrl,
          ref: entry.ref,
        });
      }
    }

    if (checkedCount === 0) {
      console.log(`${DIM}No skills tracked in lock file.${RESET}`);
      console.log(`${DIM}Install skills with${RESET} ${TEXT}${NPX_CMD} add <package>${RESET}`);
      printSkippedSkills(skipped);
      return;
    }

    if (updates.length === 0) {
      console.log(`${TEXT}✓ All skills are up to date${RESET}`);
      printSkippedSkills(skipped);
      console.log();
      return;
    }

    console.log(`${TEXT}Found ${updates.length} update(s)${RESET}`);
    console.log();

    // 逐个重新安装有更新的技能
    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
      console.log(`${TEXT}Updating ${update.name}...${RESET}`);

      // 使用 CLI 入口点直接重新安装（避免嵌套 npm exec/npx）
      const cliEntry = join(__dirname, '..', 'bin', 'cli.mjs');
      if (!existsSync(cliEntry)) {
        failCount++;
        console.log(
          `  ${DIM}✗ Failed to update ${update.name}: CLI entrypoint not found at ${cliEntry}${RESET}`
        );
        continue;
      }
      const result = spawnSync(process.execPath, [cliEntry, 'add', update.installUrl, '-g', '-y'], {
        stdio: ['inherit', 'pipe', 'pipe'],
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });

      if (result.status === 0) {
        successCount++;
        console.log(`  ${TEXT}✓${RESET} Updated ${update.name}`);
      } else {
        failCount++;
        console.log(`  ${DIM}✗ Failed to update ${update.name}${RESET}`);
      }
    }

    console.log();
    if (successCount > 0) {
      console.log(`${TEXT}✓ Updated ${successCount} skill(s)${RESET}`);
    }
    if (failCount > 0) {
      console.log(`${DIM}Failed to update ${failCount} skill(s)${RESET}`);
    }

    printSkippedSkills(skipped);

    // Track telemetry
    track({
      event: 'update',
      skillCount: String(updates.length),
      successCount: String(successCount),
      failCount: String(failCount),
    });

    console.log();
  } else {
    // 本地模式：检查本地 lock（仅 market 技能）
    const localLock = await readLocalLock();

    for (const [skillName, entry] of Object.entries(localLock.skills)) {
      if (entry.sourceType === 'market' && entry.skillId) {
        checkedCount++;
        try {
          const checkResult = await marketProvider.check(entry.skillId, entry.authorId);
          if (checkResult && checkResult.currentVersion !== entry.version) {
            const installUrl = entry.source.replace('market/', '');
            updates.push({ name: skillName, installUrl });
          }
        } catch {
          // 跳过检查失败的技能
        }
      }
    }

    if (checkedCount === 0) {
      console.log(`${DIM}No skills tracked in lock file.${RESET}`);
      console.log(`${DIM}Install skills with${RESET} ${TEXT}${NPX_CMD} add <package>${RESET}`);
      return;
    }

    if (updates.length === 0) {
      console.log(`${TEXT}✓ All skills are up to date${RESET}`);
      console.log();
      return;
    }

    console.log(`${TEXT}Found ${updates.length} update(s)${RESET}`);
    console.log();

    // 逐个重新安装有更新的技能
    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
      console.log(`${TEXT}Updating ${update.name}...${RESET}`);

      const flags = ['-y'];
      const selfArgs = [process.argv[1]!, 'add', update.installUrl, ...flags];
      const result = spawnSync(process.execPath, selfArgs, {
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      if (result.status === 0) {
        successCount++;
        console.log(`  ${TEXT}✓${RESET} Updated ${update.name}`);
      } else {
        failCount++;
        console.log(`  ${DIM}✗ Failed to update ${update.name}${RESET}`);
      }
    }

    console.log();
    if (successCount > 0) {
      console.log(`${TEXT}✓ Updated ${successCount} skill(s)${RESET}`);
    }
    if (failCount > 0) {
      console.log(`${DIM}Failed to update ${failCount} skill(s)${RESET}`);
    }

    // Track telemetry
    track({
      event: 'update',
      skillCount: String(updates.length),
      successCount: String(successCount),
      failCount: String(failCount),
    });

    console.log();
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showBanner();
    return;
  }

  const command = args[0];
  const restArgs = args.slice(1);

  switch (command) {
    case 'find':
    case 'search':
    case 'f':
    case 's':
      showLogo();
      console.log();
      await runFind(restArgs);
      break;
    case 'init':
      showLogo();
      console.log();
      runInit(restArgs);
      break;
    case 'experimental_install': {
      showLogo();
      await runInstallFromLock(restArgs);
      break;
    }
    case 'i':
    case 'install':
    case 'a':
    case 'add': {
      showLogo();
      const { source: addSource, options: addOpts } = parseAddOptions(restArgs);
      await runAdd(addSource, addOpts);
      break;
    }
    case 'remove':
    case 'rm':
    case 'r':
      // Check for --help or -h flag
      if (restArgs.includes('--help') || restArgs.includes('-h')) {
        showRemoveHelp();
        break;
      }
      const { skills, options: removeOptions } = parseRemoveOptions(restArgs);
      await removeCommand(skills, removeOptions);
      break;
    case 'experimental_sync': {
      showLogo();
      const { options: syncOptions } = parseSyncOptions(restArgs);
      await runSync(restArgs, syncOptions);
      break;
    }
    case 'list':
    case 'ls':
      await runList(restArgs);
      break;
    case 'check':
      runCheck(restArgs);
      break;
    case 'update':
    case 'upgrade':
      runUpdate(restArgs);
      break;
    case '--help':
    case '-h':
      showHelp();
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Run ${BOLD}${BIN_NAME} --help${RESET} for usage.`);
  }
}

main();
