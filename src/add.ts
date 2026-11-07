import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { sep } from 'path';
import { parseSource, getOwnerRepo, parseOwnerRepo, isRepoPrivate } from './source-parser.ts';
import { searchMultiselect } from './prompts/search-multiselect.ts';

// Helper to check if a value is a cancel symbol (works with both clack and our custom prompts)
const isCancelled = (value: unknown): value is symbol => typeof value === 'symbol';

/**
 * Check if a source identifier (owner/repo format) represents a private GitHub repo.
 * Returns true if private, false if public, null if unable to determine or not a GitHub repo.
 */
async function isSourcePrivate(source: string): Promise<boolean | null> {
  const ownerRepo = parseOwnerRepo(source);
  if (!ownerRepo) {
    // Not in owner/repo format, assume not private (could be other providers)
    return false;
  }
  return isRepoPrivate(ownerRepo.owner, ownerRepo.repo);
}
import { cloneRepo, cleanupTempDir, GitCloneError } from './git.ts';
import { discoverSkills, getSkillDisplayName, filterSkills } from './skills.ts';
import {
  installSkillForAgent,
  isSkillInstalled,
  getCanonicalPath,
  installWellKnownSkillForAgent,
  installWellKnownSkillForAgents,
  type InstallMode,
} from './installer.ts';
import {
  detectInstalledAgents,
  detectProjectAgents,
  agents,
  getUniversalAgents,
  getNonUniversalAgents,
  isUniversalAgent,
} from './agents.ts';
import {
  track,
  setVersion,
  fetchAuditData,
  type AuditResponse,
  type PartnerAudit,
} from './telemetry.ts';
import {
  wellKnownProvider,
  type WellKnownSkill,
  cosProvider,
  type CosSkill,
} from './providers/index.ts';
import { marketProvider, type MarketSkill } from './providers/market.ts';
import { hasValidCollect } from './collect.ts';
import { readLocalPilotStatus, createRecordAndInstallPilot } from './obs.ts';
import { getApiKey } from './auth.ts';
import {
  addSkillToLock,
  fetchSkillFolderHash,
  getAllLockedSkills,
  getSkillFromLock,
  getGitHubToken,
  isPromptDismissed,
  dismissPrompt,
  getLastSelectedAgents,
  saveSelectedAgents,
} from './skill-lock.ts';
import { addSkillToLocalLock, computeSkillFolderHash, readLocalLock } from './local-lock.ts';
import { computeBuildHash } from './build-hash.ts';
import type { Skill, AgentType, ParsedSource } from './types.ts';
import { NPX_CMD, EXAMPLE_REPO, SKILLS_SITE, BIN_NAME } from './branding.ts';
import packageJson from '../package.json' with { type: 'json' };
export function initTelemetry(version: string): void {
  setVersion(version);
}

// ─── Security Advisory ───

function riskLabel(risk: string): string {
  switch (risk) {
    case 'critical':
      return pc.red(pc.bold('Critical Risk'));
    case 'high':
      return pc.red('High Risk');
    case 'medium':
      return pc.yellow('Med Risk');
    case 'low':
      return pc.green('Low Risk');
    case 'safe':
      return pc.green('Safe');
    default:
      return pc.dim('--');
  }
}

function socketLabel(audit: PartnerAudit | undefined): string {
  if (!audit) return pc.dim('--');
  const count = audit.alerts ?? 0;
  return count > 0 ? pc.red(`${count} alert${count !== 1 ? 's' : ''}`) : pc.green('0 alerts');
}

/** Pad a string to a given visible width (ignoring ANSI escape codes). */
function padEnd(str: string, width: number): string {
  // Strip ANSI codes to measure visible length
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, width - visible.length);
  return str + ' '.repeat(pad);
}

/**
 * Render a compact security table showing partner audit results.
 * Returns the lines to display, or empty array if no data.
 */
function buildSecurityLines(
  auditData: AuditResponse | null,
  skills: Array<{ slug: string; displayName: string }>,
  source: string
): string[] {
  if (!auditData) return [];

  // Check if we have any audit data at all
  const hasAny = skills.some((s) => {
    const data = auditData[s.slug];
    return data && Object.keys(data).length > 0;
  });
  if (!hasAny) return [];

  // Compute column width for skill names
  const nameWidth = Math.min(Math.max(...skills.map((s) => s.displayName.length)), 36);

  // Header
  const lines: string[] = [];
  const header =
    padEnd('', nameWidth + 2) +
    padEnd(pc.dim('Gen'), 18) +
    padEnd(pc.dim('Socket'), 18) +
    pc.dim('Snyk');
  lines.push(header);

  // Rows
  for (const skill of skills) {
    const data = auditData[skill.slug];
    const name =
      skill.displayName.length > nameWidth
        ? skill.displayName.slice(0, nameWidth - 1) + '\u2026'
        : skill.displayName;

    const ath = data?.ath ? riskLabel(data.ath.risk) : pc.dim('--');
    const socket = data?.socket ? socketLabel(data.socket) : pc.dim('--');
    const snyk = data?.snyk ? riskLabel(data.snyk.risk) : pc.dim('--');

    lines.push(padEnd(pc.cyan(name), nameWidth + 2) + padEnd(ath, 18) + padEnd(socket, 18) + snyk);
  }

  // Footer link
  lines.push('');
  lines.push(`${pc.dim('Details:')} ${pc.dim(`${SKILLS_SITE}/${source}`)}`);

  return lines;
}

/**
 * Shortens a path for display: replaces homedir with ~ and cwd with .
 * Handles both Unix and Windows path separators.
 */
function shortenPath(fullPath: string, cwd: string): string {
  const home = homedir();
  // Ensure we match complete path segments by checking for separator after the prefix
  if (fullPath === home || fullPath.startsWith(home + sep)) {
    return '~' + fullPath.slice(home.length);
  }
  if (fullPath === cwd || fullPath.startsWith(cwd + sep)) {
    return '.' + fullPath.slice(cwd.length);
  }
  return fullPath;
}

/**
 * Formats a list of items, truncating if too many
 */
function formatList(items: string[], maxShow: number = 5): string {
  if (items.length <= maxShow) {
    return items.join(', ');
  }
  const shown = items.slice(0, maxShow);
  const remaining = items.length - maxShow;
  return `${shown.join(', ')} +${remaining} more`;
}

/**
 * Splits agents into universal and non-universal (symlinked) groups.
 * Returns display names for each group.
 */
function splitAgentsByType(agentTypes: AgentType[]): {
  universal: string[];
  symlinked: string[];
} {
  const universal: string[] = [];
  const symlinked: string[] = [];

  for (const a of agentTypes) {
    if (isUniversalAgent(a)) {
      universal.push(agents[a].displayName);
    } else {
      symlinked.push(agents[a].displayName);
    }
  }

  return { universal, symlinked };
}

/**
 * Builds summary lines showing universal vs symlinked agents
 */
function buildAgentSummaryLines(targetAgents: AgentType[], installMode: InstallMode): string[] {
  const lines: string[] = [];
  const { universal, symlinked } = splitAgentsByType(targetAgents);

  if (installMode === 'symlink') {
    if (universal.length > 0) {
      lines.push(`  ${pc.green('universal:')} ${formatList(universal)}`);
    }
    if (symlinked.length > 0) {
      lines.push(`  ${pc.dim('symlink →')} ${formatList(symlinked)}`);
    }
  } else {
    // Copy mode - all agents get copies
    const allNames = targetAgents.map((a) => agents[a].displayName);
    lines.push(`  ${pc.dim('copy →')} ${formatList(allNames)}`);
  }

  return lines;
}

/**
 * Ensures universal agents are always included in the target agents list.
 * Used when -y flag is passed or when auto-selecting agents.
 */
function ensureUniversalAgents(targetAgents: AgentType[]): AgentType[] {
  const universalAgents = getUniversalAgents();
  const result = [...targetAgents];

  for (const ua of universalAgents) {
    if (!result.includes(ua)) {
      result.push(ua);
    }
  }

  return result;
}

/**
 * Builds result lines from installation results, splitting by universal vs symlinked
 */
function buildResultLines(
  results: Array<{
    agent: string;
    symlinkFailed?: boolean;
  }>,
  targetAgents: AgentType[]
): string[] {
  const lines: string[] = [];

  // Split target agents by type
  const { universal, symlinked: symlinkAgents } = splitAgentsByType(targetAgents);

  // For symlink results, also track which ones actually succeeded vs failed
  const successfulSymlinks = results
    .filter((r) => !r.symlinkFailed && !universal.includes(r.agent))
    .map((r) => r.agent);
  const failedSymlinks = results.filter((r) => r.symlinkFailed).map((r) => r.agent);

  if (universal.length > 0) {
    lines.push(`  ${pc.green('universal:')} ${formatList(universal)}`);
  }
  if (successfulSymlinks.length > 0) {
    lines.push(`  ${pc.dim('symlinked:')} ${formatList(successfulSymlinks)}`);
  }
  if (failedSymlinks.length > 0) {
    lines.push(`  ${pc.yellow('copied:')} ${formatList(failedSymlinks)}`);
  }

  return lines;
}

/**
 * Wrapper around p.multiselect that adds a hint for keyboard usage.
 * Accepts options with required labels (matching our usage pattern).
 */
function multiselect<Value>(opts: {
  message: string;
  options: Array<{ value: Value; label: string; hint?: string }>;
  initialValues?: Value[];
  required?: boolean;
}) {
  return p.multiselect({
    ...opts,
    // Cast is safe: our options always have labels, which satisfies p.Option requirements
    options: opts.options as p.Option<Value>[],
    message: `${opts.message} ${pc.dim('(space to toggle)')}`,
  }) as Promise<Value[] | symbol>;
}

/**
 * Prompts the user to select agents using interactive search.
 * Pre-selects the last used agents if available.
 * Saves the selection for future use.
 */
export async function promptForAgents(
  message: string,
  choices: Array<{ value: AgentType; label: string; hint?: string }>
): Promise<AgentType[] | symbol> {
  // Get last selected agents to pre-select
  let lastSelected: string[] | undefined;
  try {
    lastSelected = await getLastSelectedAgents();
  } catch {
    // Silently ignore errors reading lock file
  }

  const validAgents = choices.map((c) => c.value);

  // Default agents to pre-select when no valid history exists
  const defaultAgents: AgentType[] = ['claude-code', 'opencode', 'codex'];
  const defaultValues = defaultAgents.filter((a) => validAgents.includes(a));

  let initialValues: AgentType[] = [];

  if (lastSelected && lastSelected.length > 0) {
    // Filter stored agents against currently valid agents
    initialValues = lastSelected.filter((a) => validAgents.includes(a as AgentType)) as AgentType[];
  }

  // If no valid selection from history, use defaults
  if (initialValues.length === 0) {
    initialValues = defaultValues;
  }

  const selected = await searchMultiselect({
    message,
    items: choices,
    initialSelected: initialValues,
    required: true,
  });

  if (!isCancelled(selected)) {
    // Save selection for next time
    try {
      await saveSelectedAgents(selected as string[]);
    } catch {
      // Silently ignore errors writing lock file
    }
  }

  return selected as AgentType[] | symbol;
}

/**
 * Interactive agent selection using fuzzy search.
 * Shows universal agents as locked (always selected), and other agents as selectable.
 */
async function selectAgentsInteractive(options: {
  global?: boolean;
}): Promise<AgentType[] | symbol> {
  // Filter out agents that don't support global installation when --global is used
  const supportsGlobalFilter = (a: AgentType) => !options.global || agents[a].globalSkillsDir;

  const universalAgents = getUniversalAgents().filter(supportsGlobalFilter);
  const otherAgents = getNonUniversalAgents().filter(supportsGlobalFilter);

  // Universal agents shown as locked section
  const universalSection = {
    title: 'Universal (.agents/skills)',
    items: universalAgents.map((a) => ({
      value: a,
      label: agents[a].displayName,
    })),
  };

  // Other agents are selectable with their skillsDir as hint
  const otherChoices = otherAgents.map((a) => ({
    value: a,
    label: agents[a].displayName,
    hint: options.global ? agents[a].globalSkillsDir! : agents[a].skillsDir,
  }));

  // Get last selected agents (filter to only non-universal ones for initial selection)
  let lastSelected: string[] | undefined;
  try {
    lastSelected = await getLastSelectedAgents();
  } catch {
    // Silently ignore errors
  }

  const initialSelected = lastSelected
    ? (lastSelected.filter(
        (a) => otherAgents.includes(a as AgentType) && !universalAgents.includes(a as AgentType)
      ) as AgentType[])
    : [];

  const selected = await searchMultiselect({
    message: 'Which agents do you want to install to?',
    items: otherChoices,
    initialSelected,
    lockedSection: universalSection,
  });

  if (!isCancelled(selected)) {
    // Save selection (all agents including universal)
    try {
      await saveSelectedAgents(selected as string[]);
    } catch {
      // Silently ignore errors
    }
  }

  return selected as AgentType[] | symbol;
}

const version = packageJson.version;
setVersion(version);

export interface AddOptions {
  global?: boolean;
  agent?: string[];
  yes?: boolean;
  skill?: string[];
  list?: boolean;
  all?: boolean;
  fullDepth?: boolean;
  copy?: boolean;
  /** 采集知情同意：true=同意统计 / false=拒绝统计；不决定安装文件类型 */
  collectConsent?: boolean;
  /** 本次显式写入 collectConsent=true 并跳过询问；不切换安装文件来源 */
  observability?: true;
  /** 团队流程已统一处理监测插件状态，跳过单 Skill 的重复检查 */
  skipPilotStatus?: boolean;
  /** 团队预取的单次安装响应；设置后不再请求 Market */
  prefetchedMarketSkill?: MarketSkill;
  /** update 内部重装时即使带 -y，也允许对可观测 Skill 重新确认采集同意 */
  recheckCollectConsent?: boolean;
}

/**
 * Handle skills from a well-known endpoint (RFC 8615).
 * Discovers skills from /.well-known/agent-skills/index.json (preferred)
 * or /.well-known/skills/index.json (legacy fallback).
 */
async function handleWellKnownSkills(
  source: string,
  url: string,
  options: AddOptions,
  spinner: ReturnType<typeof p.spinner>
): Promise<void> {
  spinner.start('Discovering skills from well-known endpoint...');

  // Fetch all skills from the well-known endpoint
  const skills = await wellKnownProvider.fetchAllSkills(url);

  if (skills.length === 0) {
    spinner.stop(pc.red('No skills found'));
    p.outro(
      pc.red(
        'No skills found at this URL. Make sure the server has a /.well-known/agent-skills/index.json or /.well-known/skills/index.json file.'
      )
    );
    process.exit(1);
  }

  spinner.stop(`Found ${pc.green(skills.length)} skill${skills.length > 1 ? 's' : ''}`);

  // Log discovered skills
  for (const skill of skills) {
    p.log.info(`Skill: ${pc.cyan(skill.installName)}`);
    p.log.message(pc.dim(skill.description));
    if (skill.files.size > 1) {
      p.log.message(pc.dim(`  Files: ${Array.from(skill.files.keys()).join(', ')}`));
    }
  }

  if (options.list) {
    console.log();
    p.log.step(pc.bold('Available Skills'));
    for (const skill of skills) {
      p.log.message(`  ${pc.cyan(skill.installName)}`);
      p.log.message(`    ${pc.dim(skill.description)}`);
      if (skill.files.size > 1) {
        p.log.message(`    ${pc.dim(`Files: ${skill.files.size}`)}`);
      }
    }
    console.log();
    p.outro('Run without --list to install');
    process.exit(0);
  }

  // Filter skills if --skill option is provided
  let selectedSkills: WellKnownSkill[];

  if (options.skill?.includes('*')) {
    // --skill '*' selects all skills
    selectedSkills = skills;
    p.log.info(`Installing all ${skills.length} skills`);
  } else if (options.skill && options.skill.length > 0) {
    selectedSkills = skills.filter((s) =>
      options.skill!.some(
        (name) =>
          s.installName.toLowerCase() === name.toLowerCase() ||
          s.name.toLowerCase() === name.toLowerCase()
      )
    );

    if (selectedSkills.length === 0) {
      p.log.error(`No matching skills found for: ${options.skill.join(', ')}`);
      p.log.info('Available skills:');
      for (const s of skills) {
        p.log.message(`  - ${s.installName}`);
      }
      process.exit(1);
    }
  } else if (skills.length === 1) {
    selectedSkills = skills;
    const firstSkill = skills[0]!;
    p.log.info(`Skill: ${pc.cyan(firstSkill.installName)}`);
  } else if (options.yes) {
    selectedSkills = skills;
    p.log.info(`Installing all ${skills.length} skills`);
  } else {
    // Prompt user to select skills
    const skillChoices = skills.map((s) => ({
      value: s,
      label: s.installName,
      hint: s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description,
    }));

    const selected = await multiselect({
      message: 'Select skills to install',
      options: skillChoices,
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    selectedSkills = selected as WellKnownSkill[];
  }

  // Detect agents
  let targetAgents: AgentType[];
  const validAgents = Object.keys(agents);

  if (options.agent?.includes('*')) {
    // --agent '*' selects all agents
    targetAgents = validAgents as AgentType[];
    p.log.info(`Installing to all ${targetAgents.length} agents`);
  } else if (options.agent && options.agent.length > 0) {
    const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));

    if (invalidAgents.length > 0) {
      p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
      p.log.info(`Valid agents: ${validAgents.join(', ')}`);
      process.exit(1);
    }

    targetAgents = options.agent as AgentType[];
  } else {
    spinner.start('Loading agents...');
    const installedAgents = await detectInstalledAgents();
    const totalAgents = Object.keys(agents).length;
    spinner.stop(`${totalAgents} agents`);

    if (installedAgents.length === 0) {
      if (options.yes) {
        targetAgents = validAgents as AgentType[];
        p.log.info('Installing to all agents');
      } else {
        p.log.info('Select agents to install skills to');

        const allAgentChoices = Object.entries(agents).map(([key, config]) => ({
          value: key as AgentType,
          label: config.displayName,
        }));

        // Use helper to prompt with search
        const selected = await promptForAgents(
          'Which agents do you want to install to?',
          allAgentChoices
        );

        if (p.isCancel(selected)) {
          p.cancel('Installation cancelled');
          process.exit(0);
        }

        targetAgents = selected as AgentType[];
      }
    } else if (installedAgents.length === 1 || options.yes) {
      // Auto-select detected agents + ensure universal agents are included
      // -y 项目安装时，优先使用项目中已有的 agent 目录
      if (options.yes && !options.global) {
        const projectAgents = await detectProjectAgents();
        if (projectAgents.length > 0) {
          targetAgents = ensureUniversalAgents(projectAgents);
        } else {
          targetAgents = ensureUniversalAgents(installedAgents);
        }
      } else {
        targetAgents = ensureUniversalAgents(installedAgents);
      }
      if (installedAgents.length === 1) {
        const firstAgent = installedAgents[0]!;
        p.log.info(`Installing to: ${pc.cyan(agents[firstAgent].displayName)}`);
      } else {
        p.log.info(
          `Installing to: ${installedAgents.map((a) => pc.cyan(agents[a].displayName)).join(', ')}`
        );
      }
    } else {
      const selected = await selectAgentsInteractive({ global: options.global });

      if (p.isCancel(selected)) {
        p.cancel('Installation cancelled');
        process.exit(0);
      }

      targetAgents = selected as AgentType[];
    }
  }

  let installGlobally = options.global ?? false;

  // Check if any selected agents support global installation
  const supportsGlobal = targetAgents.some((a) => agents[a].globalSkillsDir !== undefined);

  if (options.global === undefined && !options.yes && supportsGlobal) {
    const scope = await p.select({
      message: 'Installation scope',
      options: [
        {
          value: false,
          label: 'Project',
          hint: 'Install in current directory (committed with your project)',
        },
        {
          value: true,
          label: 'Global',
          hint: 'Install in home directory (available across all projects)',
        },
      ],
    });

    if (p.isCancel(scope)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    installGlobally = scope as boolean;
  }

  // Determine install mode (symlink vs copy)
  let installMode: InstallMode = options.copy ? 'copy' : 'symlink';

  // Only prompt for install mode when there are multiple unique target directories.
  // When all selected agents share the same skillsDir, symlink vs copy is meaningless.
  const uniqueDirs = new Set(targetAgents.map((a) => agents[a].skillsDir));

  if (!options.copy && !options.yes && uniqueDirs.size > 1) {
    const modeChoice = await p.select({
      message: 'Installation method',
      options: [
        {
          value: 'symlink',
          label: 'Symlink (Recommended)',
          hint: 'Single source of truth, easy updates',
        },
        { value: 'copy', label: 'Copy to all agents', hint: 'Independent copies for each agent' },
      ],
    });

    if (p.isCancel(modeChoice)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    installMode = modeChoice as InstallMode;
  } else if (uniqueDirs.size <= 1) {
    // Single target directory — default to copy (no symlink needed)
    installMode = 'copy';
  }

  const cwd = process.cwd();

  // Build installation summary
  const summaryLines: string[] = [];
  const agentNames = targetAgents.map((a) => agents[a].displayName);

  // Check if any skill will be overwritten (parallel)
  const overwriteChecks = await Promise.all(
    selectedSkills.flatMap((skill) =>
      targetAgents.map(async (agent) => ({
        skillName: skill.installName,
        agent,
        installed: await isSkillInstalled(skill.installName, agent, { global: installGlobally }),
      }))
    )
  );
  const overwriteStatus = new Map<string, Map<string, boolean>>();
  for (const { skillName, agent, installed } of overwriteChecks) {
    if (!overwriteStatus.has(skillName)) {
      overwriteStatus.set(skillName, new Map());
    }
    overwriteStatus.get(skillName)!.set(agent, installed);
  }

  for (const skill of selectedSkills) {
    if (summaryLines.length > 0) summaryLines.push('');

    const canonicalPath = getCanonicalPath(skill.installName, { global: installGlobally });
    const shortCanonical = shortenPath(canonicalPath, cwd);
    summaryLines.push(`${pc.cyan(shortCanonical)}`);
    summaryLines.push(...buildAgentSummaryLines(targetAgents, installMode));
    if (skill.files.size > 1) {
      summaryLines.push(`  ${pc.dim('files:')} ${skill.files.size}`);
    }

    const skillOverwrites = overwriteStatus.get(skill.installName);
    const overwriteAgents = targetAgents
      .filter((a) => skillOverwrites?.get(a))
      .map((a) => agents[a].displayName);

    if (overwriteAgents.length > 0) {
      summaryLines.push(`  ${pc.yellow('overwrites:')} ${formatList(overwriteAgents)}`);
    }
  }

  console.log();
  p.note(summaryLines.join('\n'), 'Installation Summary');

  if (!options.yes) {
    const confirmed = await p.confirm({ message: 'Proceed with installation?' });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }
  }

  spinner.start('Installing skills...');

  const results: {
    skill: string;
    agent: string;
    success: boolean;
    path: string;
    canonicalPath?: string;
    mode: InstallMode;
    symlinkFailed?: boolean;
    error?: string;
  }[] = [];

  for (const skill of selectedSkills) {
    for (const agent of targetAgents) {
      const result = await installWellKnownSkillForAgent(skill, agent, {
        global: installGlobally,
        mode: installMode,
      });
      results.push({
        skill: skill.installName,
        agent: agents[agent].displayName,
        ...result,
      });
    }
  }

  spinner.stop('Installation complete');

  console.log();
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Track installation
  const sourceIdentifier = wellKnownProvider.getSourceIdentifier(url);

  // Build skillFiles map: { skillName: sourceUrl }
  const skillFiles: Record<string, string> = {};
  for (const skill of selectedSkills) {
    skillFiles[skill.installName] = skill.sourceUrl;
  }

  // Skip telemetry for private GitHub repos
  const isPrivate = await isSourcePrivate(sourceIdentifier);
  if (isPrivate !== true) {
    // Only send telemetry if repo is public (isPrivate === false) or we can't determine (null for non-GitHub sources)
    track({
      event: 'install',
      source: sourceIdentifier,
      skills: selectedSkills.map((s) => s.installName).join(','),
      agents: targetAgents.join(','),
      ...(installGlobally && { global: '1' }),
      skillFiles: JSON.stringify(skillFiles),
      sourceType: 'well-known',
    });
  }

  // Add to skill lock file for update tracking (only for global installs)
  if (successful.length > 0 && installGlobally) {
    const successfulSkillNames = new Set(successful.map((r) => r.skill));
    for (const skill of selectedSkills) {
      if (successfulSkillNames.has(skill.installName)) {
        try {
          await addSkillToLock(skill.installName, {
            source: sourceIdentifier,
            sourceType: 'well-known',
            sourceUrl: skill.sourceUrl,
            skillFolderHash: '', // Well-known skills don't have a folder hash
          });
        } catch {
          // Don't fail installation if lock file update fails
        }
      }
    }
  }

  // Add to local lock file for project-scoped installs
  if (successful.length > 0 && !installGlobally) {
    const successfulSkillNames = new Set(successful.map((r) => r.skill));
    for (const skill of selectedSkills) {
      if (successfulSkillNames.has(skill.installName)) {
        try {
          const matchingResult = successful.find((r) => r.skill === skill.installName);
          const installDir = matchingResult?.canonicalPath || matchingResult?.path;
          if (installDir) {
            const computedHash = await computeSkillFolderHash(installDir);
            await addSkillToLocalLock(
              skill.installName,
              {
                source: sourceIdentifier,
                sourceType: 'well-known',
                computedHash,
              },
              cwd
            );
          }
        } catch {
          // Don't fail installation if lock file update fails
        }
      }
    }
  }

  if (successful.length > 0) {
    const bySkill = new Map<string, typeof results>();
    for (const r of successful) {
      const skillResults = bySkill.get(r.skill) || [];
      skillResults.push(r);
      bySkill.set(r.skill, skillResults);
    }

    const skillCount = bySkill.size;
    const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);
    const copiedAgents = symlinkFailures.map((r) => r.agent);
    const resultLines: string[] = [];

    for (const [skillName, skillResults] of bySkill) {
      const firstResult = skillResults[0]!;

      if (firstResult.mode === 'copy') {
        // Copy mode: show skill name and list all agent paths
        resultLines.push(`${pc.green('✓')} ${skillName} ${pc.dim('(copied)')}`);
        for (const r of skillResults) {
          const shortPath = shortenPath(r.path, cwd);
          resultLines.push(`  ${pc.dim('→')} ${shortPath}`);
        }
      } else {
        // Symlink mode: show canonical path and universal/symlinked agents
        if (firstResult.canonicalPath) {
          const shortPath = shortenPath(firstResult.canonicalPath, cwd);
          resultLines.push(`${pc.green('✓')} ${shortPath}`);
        } else {
          resultLines.push(`${pc.green('✓')} ${skillName}`);
        }
        resultLines.push(...buildResultLines(skillResults, targetAgents));
      }
    }

    const title = pc.green(`Installed ${skillCount} skill${skillCount !== 1 ? 's' : ''}`);
    p.note(resultLines.join('\n'), title);

    // Show symlink failure warning (only for symlink mode)
    if (symlinkFailures.length > 0) {
      p.log.warn(pc.yellow(`Symlinks failed for: ${formatList(copiedAgents)}`));
      p.log.message(
        pc.dim(
          '  Files were copied instead. On Windows, enable Developer Mode for symlink support.'
        )
      );
    }
  }

  if (failed.length > 0) {
    console.log();
    p.log.error(pc.red(`Failed to install ${failed.length}`));
    for (const r of failed) {
      p.log.message(`  ${pc.red('✗')} ${r.skill} → ${r.agent}: ${pc.dim(r.error)}`);
    }
  }

  console.log();
  p.outro(
    pc.green('Done!') + pc.dim('  Review skills before use; they run with full agent permissions.')
  );

  // Prompt for find-skills after successful install
  await promptForFindSkills(options, targetAgents);
}

/**
 * Handle skills from a Tencent COS bucket.
 * Discovers skills from skills/<id>/versions/<version>/ directory structure.
 */
async function handleCosSkills(
  source: string,
  url: string,
  options: AddOptions,
  spinner: ReturnType<typeof p.spinner>
): Promise<void> {
  spinner.start('Discovering skills from COS bucket...');

  const skills = await cosProvider.fetchAllSkills(url);

  if (skills.length === 0) {
    spinner.stop(pc.red('No skills found'));
    p.outro(
      pc.red(`No index.json found at this COS URL.`) +
        `\n\n` +
        pc.dim(`Place an index.json at: ${url.replace(/\/?$/, '/')}index.json\n\n`) +
        pc.bold(`Example index.json:\n`) +
        `{\n` +
        `  "skills": [\n` +
        `    {\n` +
        `      "name": "my-skill",\n` +
        `      "files": ["SKILL.md"]\n` +
        `    },\n` +
        `    {\n` +
        `      "name": "another-skill",\n` +
        `      "files": ["SKILL.md", "references/commands.md", "examples/demo.sh"]\n` +
        `    }\n` +
        `  ]\n` +
        `}\n\n` +
        pc.dim(`Notes:\n`) +
        pc.dim(`  - "name"   directory name under the URL path (also used as install name)\n`) +
        pc.dim(`  - "files"  all files to install, relative to the skill directory`)
    );
    process.exit(1);
  }

  spinner.stop(`Found ${pc.green(skills.length)} skill${skills.length > 1 ? 's' : ''}`);

  // Log discovered skills
  for (const skill of skills) {
    p.log.info(`Skill: ${pc.cyan(skill.installName)} ${pc.dim(`v${skill.version}`)}`);
    p.log.message(pc.dim(skill.description));
    if (skill.files.size > 1) {
      p.log.message(pc.dim(`  Files: ${Array.from(skill.files.keys()).join(', ')}`));
    }
  }

  if (options.list) {
    console.log();
    p.log.step(pc.bold('Available Skills'));
    for (const skill of skills) {
      p.log.message(`  ${pc.cyan(skill.installName)} ${pc.dim(`v${skill.version}`)}`);
      p.log.message(`    ${pc.dim(skill.description)}`);
      if (skill.files.size > 1) {
        p.log.message(`    ${pc.dim(`Files: ${skill.files.size}`)}`);
      }
    }
    console.log();
    p.outro(`Run without --list to install\n` + pc.dim(`  Install all:  skills add ${url} --all`));
    process.exit(0);
  }

  // Filter skills if --skill option is provided
  let selectedSkills: CosSkill[];

  if (options.skill?.includes('*')) {
    selectedSkills = skills;
    p.log.info(`Installing all ${skills.length} skills`);
  } else if (options.skill && options.skill.length > 0) {
    selectedSkills = skills.filter((s) =>
      options.skill!.some(
        (name) =>
          s.installName.toLowerCase() === name.toLowerCase() ||
          s.name.toLowerCase() === name.toLowerCase()
      )
    );

    if (selectedSkills.length === 0) {
      p.log.error(`No matching skills found for: ${options.skill.join(', ')}`);
      p.log.info('Available skills:');
      for (const s of skills) {
        p.log.message(`  - ${s.installName}`);
      }
      process.exit(1);
    }
  } else if (skills.length === 1) {
    selectedSkills = skills;
    const firstSkill = skills[0]!;
    p.log.info(`Skill: ${pc.cyan(firstSkill.installName)}`);
  } else if (options.yes) {
    selectedSkills = skills;
    p.log.info(`Installing all ${skills.length} skills`);
  } else {
    const skillChoices = skills.map((s) => ({
      value: s,
      label: `${s.installName} ${pc.dim(`v${s.version}`)}`,
      hint: s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description,
    }));

    const selected = await multiselect({
      message: 'Select skills to install',
      options: skillChoices,
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    selectedSkills = selected as CosSkill[];
  }

  // Detect agents
  let targetAgents: AgentType[];
  const validAgents = Object.keys(agents);

  if (options.agent?.includes('*')) {
    targetAgents = validAgents as AgentType[];
    p.log.info(`Installing to all ${targetAgents.length} agents`);
  } else if (options.agent && options.agent.length > 0) {
    const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));

    if (invalidAgents.length > 0) {
      p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
      p.log.info(`Valid agents: ${validAgents.join(', ')}`);
      process.exit(1);
    }

    targetAgents = options.agent as AgentType[];
  } else {
    spinner.start('Loading agents...');
    const installedAgents = await detectInstalledAgents();
    const totalAgents = Object.keys(agents).length;
    spinner.stop(`${totalAgents} agents`);

    if (installedAgents.length === 0) {
      if (options.yes) {
        targetAgents = validAgents as AgentType[];
        p.log.info('Installing to all agents');
      } else {
        p.log.info('Select agents to install skills to');

        const allAgentChoices = Object.entries(agents).map(([key, config]) => ({
          value: key as AgentType,
          label: config.displayName,
        }));

        const selected = await promptForAgents(
          'Which agents do you want to install to?',
          allAgentChoices
        );

        if (p.isCancel(selected)) {
          p.cancel('Installation cancelled');
          process.exit(0);
        }

        targetAgents = selected as AgentType[];
      }
    } else if (installedAgents.length === 1 || options.yes) {
      // -y 项目安装时，优先使用项目中已有的 agent 目录
      if (options.yes && !options.global) {
        const projectAgents = await detectProjectAgents();
        if (projectAgents.length > 0) {
          targetAgents = ensureUniversalAgents(projectAgents);
        } else {
          targetAgents = ensureUniversalAgents(installedAgents);
        }
      } else {
        targetAgents = ensureUniversalAgents(installedAgents);
      }
      if (installedAgents.length === 1) {
        const firstAgent = installedAgents[0]!;
        p.log.info(`Installing to: ${pc.cyan(agents[firstAgent].displayName)}`);
      } else {
        p.log.info(
          `Installing to: ${installedAgents.map((a) => pc.cyan(agents[a].displayName)).join(', ')}`
        );
      }
    } else {
      const selected = await selectAgentsInteractive({ global: options.global });

      if (p.isCancel(selected)) {
        p.cancel('Installation cancelled');
        process.exit(0);
      }

      targetAgents = selected as AgentType[];
    }
  }

  let installGlobally = options.global ?? false;

  const supportsGlobal = targetAgents.some((a) => agents[a].globalSkillsDir !== undefined);

  if (options.global === undefined && !options.yes && supportsGlobal) {
    const scope = await p.select({
      message: 'Installation scope',
      options: [
        {
          value: false,
          label: 'Project',
          hint: 'Install in current directory (committed with your project)',
        },
        {
          value: true,
          label: 'Global',
          hint: 'Install in home directory (available across all projects)',
        },
      ],
    });

    if (p.isCancel(scope)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    installGlobally = scope as boolean;
  }

  let installMode: InstallMode = options.copy ? 'copy' : 'symlink';

  if (!options.copy && !options.yes) {
    const modeChoice = await p.select({
      message: 'Installation method',
      options: [
        {
          value: 'symlink',
          label: 'Symlink (Recommended)',
          hint: 'Single source of truth, easy updates',
        },
        { value: 'copy', label: 'Copy to all agents', hint: 'Independent copies for each agent' },
      ],
    });

    if (p.isCancel(modeChoice)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    installMode = modeChoice as InstallMode;
  }

  const cwd = process.cwd();

  // Build installation summary
  const summaryLines: string[] = [];

  const overwriteChecks = await Promise.all(
    selectedSkills.flatMap((skill) =>
      targetAgents.map(async (agent) => ({
        skillName: skill.installName,
        agent,
        installed: await isSkillInstalled(skill.installName, agent, { global: installGlobally }),
      }))
    )
  );
  const overwriteStatus = new Map<string, Map<string, boolean>>();
  for (const { skillName, agent, installed } of overwriteChecks) {
    if (!overwriteStatus.has(skillName)) {
      overwriteStatus.set(skillName, new Map());
    }
    overwriteStatus.get(skillName)!.set(agent, installed);
  }

  for (const skill of selectedSkills) {
    if (summaryLines.length > 0) summaryLines.push('');

    const canonicalPath = getCanonicalPath(skill.installName, { global: installGlobally });
    const shortCanonical = shortenPath(canonicalPath, cwd);
    summaryLines.push(`${pc.cyan(shortCanonical)} ${pc.dim(`v${skill.version}`)}`);
    summaryLines.push(...buildAgentSummaryLines(targetAgents, installMode));
    if (skill.files.size > 1) {
      summaryLines.push(`  ${pc.dim('files:')} ${skill.files.size}`);
    }

    const skillOverwrites = overwriteStatus.get(skill.installName);
    const overwriteAgents = targetAgents
      .filter((a) => skillOverwrites?.get(a))
      .map((a) => agents[a].displayName);

    if (overwriteAgents.length > 0) {
      summaryLines.push(`  ${pc.yellow('overwrites:')} ${formatList(overwriteAgents)}`);
    }
  }

  console.log();
  p.note(summaryLines.join('\n'), 'Installation Summary');

  if (!options.yes) {
    const confirmed = await p.confirm({ message: 'Proceed with installation?' });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }
  }

  spinner.start('Installing skills...');

  const results: {
    skill: string;
    agent: string;
    success: boolean;
    path: string;
    canonicalPath?: string;
    mode: InstallMode;
    symlinkFailed?: boolean;
    error?: string;
  }[] = [];

  for (const skill of selectedSkills) {
    for (const agent of targetAgents) {
      const result = await installWellKnownSkillForAgent(skill, agent, {
        global: installGlobally,
        mode: installMode,
      });
      results.push({
        skill: skill.installName,
        agent: agents[agent].displayName,
        ...result,
      });
    }
  }

  spinner.stop('Installation complete');

  console.log();
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Track installation
  const sourceIdentifier = cosProvider.getSourceIdentifier(url);

  const skillFiles: Record<string, string> = {};
  for (const skill of selectedSkills) {
    skillFiles[skill.installName] = skill.sourceUrl;
  }

  const isPrivate = await isSourcePrivate(sourceIdentifier);
  if (isPrivate !== true) {
    track({
      event: 'install',
      source: sourceIdentifier,
      skills: selectedSkills.map((s) => s.installName).join(','),
      agents: targetAgents.join(','),
      ...(installGlobally && { global: '1' }),
      skillFiles: JSON.stringify(skillFiles),
      sourceType: 'cos',
    });
  }

  // Add to skill lock file for update tracking (only for global installs)
  if (successful.length > 0 && installGlobally) {
    const successfulSkillNames = new Set(successful.map((r) => r.skill));
    for (const skill of selectedSkills) {
      if (successfulSkillNames.has(skill.installName)) {
        try {
          await addSkillToLock(skill.installName, {
            source: sourceIdentifier,
            sourceType: 'cos',
            sourceUrl: skill.sourceUrl,
            skillFolderHash: '',
          });
        } catch {
          // Don't fail installation if lock file update fails
        }
      }
    }
  }

  // Add to local lock file for project-scoped installs
  if (successful.length > 0 && !installGlobally) {
    const successfulSkillNames = new Set(successful.map((r) => r.skill));
    for (const skill of selectedSkills) {
      if (successfulSkillNames.has(skill.installName)) {
        try {
          const matchingResult = successful.find((r) => r.skill === skill.installName);
          const installDir = matchingResult?.canonicalPath || matchingResult?.path;
          if (installDir) {
            const computedHash = await computeSkillFolderHash(installDir);
            await addSkillToLocalLock(
              skill.installName,
              {
                source: sourceIdentifier,
                sourceType: 'cos',
                computedHash,
              },
              cwd
            );
          }
        } catch {
          // Don't fail installation if lock file update fails
        }
      }
    }
  }

  if (successful.length > 0) {
    const bySkill = new Map<string, typeof results>();
    for (const r of successful) {
      const skillResults = bySkill.get(r.skill) || [];
      skillResults.push(r);
      bySkill.set(r.skill, skillResults);
    }

    const skillCount = bySkill.size;
    const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);
    const copiedAgents = symlinkFailures.map((r) => r.agent);
    const resultLines: string[] = [];

    for (const [skillName, skillResults] of bySkill) {
      const firstResult = skillResults[0]!;

      if (firstResult.mode === 'copy') {
        resultLines.push(`${pc.green('\u2713')} ${skillName} ${pc.dim('(copied)')}`);
        for (const r of skillResults) {
          const shortPath = shortenPath(r.path, cwd);
          resultLines.push(`  ${pc.dim('\u2192')} ${shortPath}`);
        }
      } else {
        if (firstResult.canonicalPath) {
          const shortPath = shortenPath(firstResult.canonicalPath, cwd);
          resultLines.push(`${pc.green('\u2713')} ${shortPath}`);
        } else {
          resultLines.push(`${pc.green('\u2713')} ${skillName}`);
        }
        resultLines.push(...buildResultLines(skillResults, targetAgents));
      }
    }

    const title = pc.green(`Installed ${skillCount} skill${skillCount !== 1 ? 's' : ''}`);
    p.note(resultLines.join('\n'), title);

    if (symlinkFailures.length > 0) {
      p.log.warn(pc.yellow(`Symlinks failed for: ${formatList(copiedAgents)}`));
      p.log.message(
        pc.dim(
          '  Files were copied instead. On Windows, enable Developer Mode for symlink support.'
        )
      );
    }
  }

  if (failed.length > 0) {
    console.log();
    p.log.error(pc.red(`Failed to install ${failed.length}`));
    for (const r of failed) {
      p.log.message(`  ${pc.red('\u2717')} ${r.skill} \u2192 ${r.agent}: ${pc.dim(r.error)}`);
    }
  }

  console.log();
  p.outro(
    pc.green('Done!') + pc.dim('  Review skills before use; they run with full agent permissions.')
  );

  await promptForFindSkills(options, targetAgents);
}

/**
 * Handle team install: `blueai-skills add t_<teamId>/<teamName>`
 * Fetches all installable skills for the team and installs them sequentially.
 */
interface TeamInstallSkill {
  id: string;
  teamId?: string;
  name: string;
  displayName: string | null;
  currentVersion: string | null;
  installVersion?: string | null;
  releaseId?: string;
  visibility: string;
  authorId: string;
}

interface TeamInstallData {
  teamName: string;
  skills: TeamInstallSkill[];
}

function resolveTeamInstallVersion(skill: TeamInstallSkill): string | null {
  return skill.installVersion || skill.currentVersion || null;
}

function getTeamCollectKey(teamId: string, skillId: string): string {
  return `${teamId}:${skillId}`;
}

function formatInstallFailure(
  result: { status: number; code?: string; message: string },
  displayName: string
): string {
  if (result.code === 'OBS_VERSION_UNAVAILABLE') {
    return `当前版本尚无可安装的可观测产物：${displayName}`;
  }
  if (result.status === 0) {
    return `网络错误：${result.message}`;
  }
  return `${displayName} 安装失败：${result.message}`;
}

async function resolveExpectedReleaseSeq(params: {
  skillId: string;
  authorId?: string;
  teamId?: string;
  releaseId?: string;
}): Promise<{ ok: true; releaseSeq?: number; version?: string } | { ok: false; message: string }> {
  const target =
    params.teamId && params.releaseId
      ? {
          scope: 'TEAM' as const,
          skillId: params.skillId,
          teamId: params.teamId,
          releaseId: params.releaseId,
        }
      : {
          scope: params.authorId ? ('PRIVATE' as const) : ('PUBLIC' as const),
          skillId: params.skillId,
          ...(params.authorId ? { authorId: params.authorId } : {}),
        };
  const checked = await marketProvider.checkBuildBatch([target]);
  if (!checked.ok) {
    return { ok: false, message: checked.message || '构建检测失败' };
  }
  let item = checked.data.items[0];
  if (!item?.ok && target.scope === 'PRIVATE' && params.authorId) {
    const publicCheck = await marketProvider.checkBuildBatch([
      { scope: 'PUBLIC', skillId: params.skillId },
    ]);
    if (publicCheck.ok && publicCheck.data.items[0]?.ok) {
      item = publicCheck.data.items[0];
    }
  }
  if (!item?.ok) {
    return { ok: false, message: item?.error?.message ?? '构建检测失败' };
  }
  if (item.observabilityEnabled === true && item.releaseSeq === undefined) {
    return { ok: false, message: 'Market 观测状态缺少 releaseSeq，已 fail-closed' };
  }
  return {
    ok: true,
    ...(item.observabilityEnabled === true ? { releaseSeq: item.releaseSeq } : {}),
    ...(item.version ? { version: item.version } : {}),
  };
}

async function handleTeamInstall(
  teamId: string,
  teamName: string,
  options: AddOptions,
  spinner: ReturnType<typeof p.spinner>
): Promise<void> {
  spinner.start(`Fetching skills for team "${teamName}"...`);

  let teamData: TeamInstallData | null = null;
  try {
    const res = await fetch(`${SKILLS_SITE}/api/team/installAll?id=${encodeURIComponent(teamId)}`);
    if (res.status === 404) {
      spinner.stop(pc.red('Team not found'));
      p.outro(pc.red(`团队不存在或已解散：t_${teamId}`));
      process.exit(1);
    }
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      spinner.stop(pc.red('Failed to fetch team skills'));
      p.outro(pc.red(json.message || `请求失败：HTTP ${res.status}`));
      process.exit(1);
    }
    const json = (await res.json()) as { data?: TeamInstallData };
    teamData = json.data ?? null;
  } catch (err) {
    spinner.stop(pc.red('Network error'));
    p.outro(pc.red(`网络错误：${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  if (!teamData || teamData.skills.length === 0) {
    spinner.stop(pc.yellow('No installable skills'));
    p.outro(pc.yellow(`该团队暂无可安装的 skill`));
    return;
  }

  const installableSkills = teamData.skills.filter((skill) => {
    const version = resolveTeamInstallVersion(skill);
    if (version) return true;
    p.log.warn(`Skipping ${skill.name} from team ${teamId}: missing installVersion/currentVersion`);
    return false;
  });
  if (installableSkills.length === 0) {
    spinner.stop(pc.yellow('No installable skills'));
    p.outro(pc.yellow('该团队暂无可安装的 skill（均缺少生效版本）'));
    return;
  }
  teamData = { ...teamData, skills: installableSkills };

  const resolvedTeamName = teamData.teamName || teamName;
  spinner.stop(
    `Team: ${pc.cyan(resolvedTeamName)} — ${pc.bold(String(teamData.skills.length))} skill${teamData.skills.length > 1 ? 's' : ''}`
  );

  // 在循环前做一次 agent + scope 选择，后续每个 skill 复用同一份配置
  let targetAgents: AgentType[];
  if (options.agent && options.agent.length > 0) {
    // 用户已通过 --agent 指定，直接用
    targetAgents = options.agent as AgentType[];
  } else {
    // 检测已安装 agent，走标准交互选择流程
    const installedAgents = await detectInstalledAgents();
    const validAgents = Object.keys(agents) as AgentType[];

    if (installedAgents.length === 1 || options.yes) {
      targetAgents = ensureUniversalAgents(
        installedAgents.length > 0 ? installedAgents : validAgents
      );
    } else if (installedAgents.length === 0) {
      const allAgentChoices = Object.entries(agents).map(([key, config]) => ({
        value: key as AgentType,
        label: config.displayName,
      }));
      const selected = await promptForAgents(
        'Which agents do you want to install to?',
        allAgentChoices
      );
      if (p.isCancel(selected)) {
        p.cancel('Installation cancelled');
        process.exit(0);
      }
      targetAgents = selected as AgentType[];
    } else {
      const selected = await selectAgentsInteractive({ global: options.global });
      if (p.isCancel(selected)) {
        p.cancel('Installation cancelled');
        process.exit(0);
      }
      targetAgents = selected as AgentType[];
    }
  }

  // scope 选择（project vs global），仅在未通过 --global 指定且非 -y 模式时交互
  let installGlobally = options.global ?? false;
  const supportsGlobal = targetAgents.some((a) => agents[a]?.globalSkillsDir !== undefined);
  if (options.global === undefined && !options.yes && supportsGlobal) {
    const scope = await p.select({
      message: 'Installation scope',
      options: [
        { value: false, label: 'Project', hint: 'Install in current directory' },
        { value: true, label: 'Global', hint: 'Install in home directory' },
      ],
    });
    if (p.isCancel(scope)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }
    installGlobally = scope as boolean;
  }

  // 安装方式选择（symlink vs copy），仅在未通过 --copy 指定且非 -y 模式时交互
  let useCopy = options.copy ?? false;
  if (!options.copy && !options.yes) {
    const modeChoice = await p.select({
      message: 'Installation method',
      options: [
        {
          value: 'symlink',
          label: 'Symlink (Recommended)',
          hint: 'Single source of truth, easy updates',
        },
        { value: 'copy', label: 'Copy to all agents', hint: 'Independent copies for each agent' },
      ],
    });
    if (p.isCancel(modeChoice)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }
    useCopy = modeChoice === 'copy';
  }

  const sharedOptions: AddOptions = {
    ...options,
    agent: targetAgents,
    global: installGlobally,
    copy: useCopy,
    yes: true, // agent + scope + installMode 已选定，跳过每个 skill 的重复交互
    skipPilotStatus: true,
  };

  // 团队批量安装每个 Skill 只预取一次；同一响应用于 consent 判断和实际落盘。
  const cwd = process.cwd();
  const teamInstallDecision = await preflightTeamInstall(
    teamData.skills,
    teamId,
    options,
    installGlobally,
    cwd
  );
  if (teamInstallDecision.showPilotStatus) {
    await promptForPilotInstallation(teamInstallDecision.allowPilotPrompt);
  }

  p.log.info(`Installing ${teamData.skills.length} skills from team "${resolvedTeamName}"...`);

  // 依次安装每个 skill，复用 handleMarketSkill 的单 skill 安装逻辑
  let installedCount = 0;
  let failedCount = teamInstallDecision.failures.size;
  for (const skill of teamData.skills) {
    const installVersion = resolveTeamInstallVersion(skill);
    if (!installVersion) continue;
    const key = getTeamCollectKey(teamId, skill.id);
    const failure = teamInstallDecision.failures.get(key);
    if (failure) {
      p.log.error(`✗ ${skill.name}: ${failure}`);
      continue;
    }

    const prefetchedMarketSkill = teamInstallDecision.installResults.get(key);
    if (!prefetchedMarketSkill) {
      failedCount++;
      p.log.error(`✗ ${skill.name}: 团队版本未返回可安装产物`);
      continue;
    }

    const skillOptions: AddOptions = {
      ...sharedOptions,
      collectConsent: teamInstallDecision.consentByKey.get(key),
      prefetchedMarketSkill,
    };

    const installResult = await handleMarketSkill(
      `t_${teamId}/${skill.name}`,
      {
        type: 'market',
        url: `t_${teamId}/${skill.name}`,
        marketSkillId: skill.id,
        marketTeamId: teamId,
        marketName: skill.name,
        marketVersion: installVersion,
        marketReleaseId: skill.releaseId,
      },
      skillOptions,
      p.spinner()
    );
    if (installResult.installed) {
      installedCount++;
    } else {
      failedCount++;
    }
  }

  if (failedCount > 0) {
    process.exitCode = 1;
    p.outro(
      pc.yellow(
        `团队安装完成：成功 ${installedCount} 个，失败 ${failedCount} 个（${resolvedTeamName}）`
      )
    );
    return;
  }
  p.outro(pc.green(`✓ Installed ${installedCount} skills from team "${resolvedTeamName}"`));
}

/**
 * Handle skills from the Skills Market.
 * Supports two flows:
 * 1. Token-based install: URL contains /install/<token>
 * 2. Name-based install: bare skill name resolved via /api/skill/resolve
 */
/**
 * 解析当前 scope 对应 lock 中某 skill 的采集定夺状态（D1）：
 * @returns true = 同意统计；false = 拒绝统计；'missing' = 首次未定夺
 */
async function getSkillConsent(
  skillName: string,
  installGlobally: boolean,
  cwd: string
): Promise<boolean | 'missing'> {
  try {
    const entry = installGlobally
      ? await getSkillFromLock(skillName)
      : (await readLocalLock(cwd)).skills[skillName];
    if (entry?.collectConsent === true) return true;
    if (entry?.collectConsent === false) return false;
    return 'missing';
  } catch {
    return 'missing';
  }
}

export async function getTeamSkillConsent(
  teamId: string,
  installName: string,
  installGlobally: boolean,
  cwd: string
): Promise<boolean | 'missing'> {
  try {
    const entries = installGlobally
      ? await getAllLockedSkills()
      : (await readLocalLock(cwd)).skills;
    const matched = Object.entries(entries).find(
      ([name, entry]) => name === installName && entry.teamId === teamId
    );
    if (matched?.[1].collectConsent === true) return true;
    if (matched?.[1].collectConsent === false) return false;
    return 'missing';
  } catch {
    return 'missing';
  }
}

/**
 * 团队批量安装预取：
 * - 每个 Skill 只请求一次 release-bound 安装响应；
 * - 同一响应既用于识别可观测 Skill，也用于随后落盘；
 * - 仅对 consent 未定夺的可观测 Skill 做一次团队级询问。
 */
interface TeamInstallDecision {
  installResults: Map<string, MarketSkill>;
  consentByKey: Map<string, boolean>;
  failures: Map<string, string>;
  showPilotStatus: boolean;
  allowPilotPrompt: boolean;
}

async function preflightTeamInstall(
  skills: TeamInstallSkill[],
  teamId: string,
  options: AddOptions,
  installGlobally: boolean,
  cwd: string
): Promise<TeamInstallDecision> {
  const installResults = new Map<string, MarketSkill>();
  const consentByKey = new Map<string, boolean>();
  const failures = new Map<string, string>();
  const recheckConsentKeys: string[] = [];
  const forceObservability = options.observability === true;

  for (const s of skills) {
    const version = resolveTeamInstallVersion(s);
    if (!version) continue;

    if (!s.releaseId) {
      failures.set(getTeamCollectKey(teamId, s.id), `团队版本不可用：${s.name} 缺少 releaseId`);
      continue;
    }

    const checked = await resolveExpectedReleaseSeq({
      skillId: s.id,
      teamId,
      releaseId: s.releaseId,
    });
    if (!checked.ok) {
      failures.set(getTeamCollectKey(teamId, s.id), checked.message);
      continue;
    }
    const result =
      checked.releaseSeq === undefined
        ? await marketProvider.installById(
            s.id,
            checked.version ?? version,
            undefined,
            teamId,
            s.releaseId
          )
        : await marketProvider.installById(
            s.id,
            checked.version ?? version,
            undefined,
            teamId,
            s.releaseId,
            checked.releaseSeq
          );
    const key = getTeamCollectKey(teamId, s.id);
    if (!result.ok) {
      failures.set(key, formatInstallFailure(result, s.name));
      continue;
    }

    const skill = result.data;
    installResults.set(key, skill);

    if (forceObservability) {
      consentByKey.set(key, true);
      continue;
    }

    if (hasValidCollect(skill)) {
      const locked = await getTeamSkillConsent(teamId, skill.installName, installGlobally, cwd);
      if (locked === true) {
        consentByKey.set(key, locked);
      } else {
        recheckConsentKeys.push(key);
      }
    }
  }

  let recheckedConsent = options.collectConsent;
  const canPrompt = process.stdin.isTTY && (!options.yes || options.recheckCollectConsent === true);
  if (recheckedConsent === undefined && recheckConsentKeys.length > 0) {
    if (!canPrompt) {
      recheckedConsent = false;
    } else {
      const confirmed = await p.confirm({
        message: `本团队有 ${recheckConsentKeys.length} 个可观测 skill 需要重新确认数据采集（上次选择不采集或尚未定夺，安装文件不变），是否同意统计？`,
      });
      if (p.isCancel(confirmed)) {
        p.cancel('Installation cancelled');
        process.exit(0);
      }
      recheckedConsent = !!confirmed;
    }
  }

  for (const key of recheckConsentKeys) {
    consentByKey.set(key, recheckedConsent ?? false);
  }

  const observableKeys = [...installResults.entries()]
    .filter(([, skill]) => hasValidCollect(skill))
    .map(([key]) => key);
  const hasEnabledObservable = observableKeys.some((key) => consentByKey.get(key) === true);

  return {
    installResults,
    consentByKey,
    failures,
    showPilotStatus: hasEnabledObservable,
    allowPilotPrompt: hasEnabledObservable && !options.yes && !!process.stdin.isTTY,
  };
}

/**
 * 统一处理 LoongSuite Pilot 本机状态：完整安装仅提示；缺失/残留时按交互能力
 * 决定是否询问并自动安装，否则保留一次手动安装指引。
 */
async function promptForPilotInstallation(allowPrompt: boolean): Promise<void> {
  const pilot = readLocalPilotStatus();
  const missingReason =
    pilot.serviceName != null
      ? '检测到监测插件配置残留（未发现程序文件）'
      : '未检测到 LoongSuite Pilot 监测插件';

  if (pilot.serviceName != null && pilot.hasBinary) {
    const running = pilot.isRunning === false ? '，服务未运行' : '';
    p.log.message(pc.dim(`本机监测插件: 已安装 LoongSuite Pilot (${pilot.serviceName}${running})`));
    return;
  }

  if (!allowPrompt || !process.stdin.isTTY) {
    p.log.message(
      pc.yellow(
        `本机监测插件: ${missingReason}，采集数据不会实际上报；可稍后运行 ${pc.cyan(`${BIN_NAME} obs <接入名>`)} 创建接入并安装监测插件`
      )
    );
    return;
  }

  if (!getApiKey()) {
    p.log.message(
      pc.yellow(
        `本机监测插件: ${missingReason}，采集数据不会实际上报；先运行 ${pc.cyan(`${BIN_NAME} login <api-key>`)} 登录，下次安装带监测的 skill 时可自动安装`
      )
    );
    return;
  }

  p.log.message(pc.yellow(`本机监测插件: ${missingReason}，采集数据不会实际上报`));
  const installPilot = await p.confirm({
    message: '是否现在创建接入记录并自动安装 LoongSuite Pilot 监测插件？',
    initialValue: true,
  });
  if (!p.isCancel(installPilot) && installPilot) {
    await createRecordAndInstallPilot(getApiKey()!);
  } else {
    p.log.message(
      pc.dim(`已跳过；可稍后运行 ${pc.cyan(`${BIN_NAME} obs <接入名>`)} 创建接入并安装监测插件`)
    );
  }
}

export async function handleMarketSkill(
  source: string,
  parsed: ParsedSource,
  options: AddOptions,
  spinner: ReturnType<typeof p.spinner>
): Promise<{ fallbackToGitHub: boolean; installed: boolean }> {
  // Name-based install: [author/]name[@version]
  let skillName = parsed.marketName || source;
  let author = parsed.marketAuthor;
  let version = parsed.marketVersion;
  let teamId = parsed.marketTeamId;
  let releaseId = parsed.marketReleaseId;
  const isTeamSkillCommand = source.trim().startsWith('ts_');
  const teamSkillId = isTeamSkillCommand && author?.startsWith('ts_') ? author.slice(3) : undefined;
  const displayName = isTeamSkillCommand
    ? teamSkillId !== undefined
      ? `ts_${teamSkillId}/${skillName}`
      : source.trim()
    : teamId
      ? `t_${teamId}/${skillName}`
      : author
        ? `${author}/${skillName}`
        : skillName;
  let resolved: {
    id: string;
    name: string;
    currentVersion: string;
    authorId: string;
    teamId?: string;
  } | null = null;

  if (isTeamSkillCommand) {
    if (!teamSkillId || !skillName || skillName.includes('/') || parsed.marketVersion) {
      p.outro(
        pc.red(
          '团队单 Skill 命令格式错误：应为 ts_<skillTeamId>/<skillName>，且不允许显式 @version'
        )
      );
      process.exit(1);
    }

    spinner.start(`Resolving "${displayName}" from Skills Market...`);
    const targetResult = await marketProvider.resolveTeamSkillInstallTarget(teamSkillId, skillName);
    if (!targetResult.ok) {
      spinner.stop(pc.red('Failed to resolve team Skill'));
      p.outro(pc.red(targetResult.message || '团队单 Skill 解析失败'));
      process.exit(1);
    }

    const target = targetResult.data;
    if (!target.releaseId) {
      spinner.stop(pc.red('Failed to resolve team Skill'));
      p.outro(pc.red(`团队版本不可用：${displayName} 缺少 releaseId`));
      process.exit(1);
    }
    resolved = {
      id: target.skillId,
      name: target.skillName,
      currentVersion: target.installVersion,
      authorId: '',
      teamId: target.teamId,
    };
    skillName = target.skillName;
    author = undefined;
    version = target.installVersion;
    teamId = target.teamId;
    releaseId = target.releaseId;
  } else if (parsed.marketSkillId && teamId) {
    spinner.start(`Resolving "${displayName}" from Skills Market...`);
    resolved = {
      id: parsed.marketSkillId,
      name: skillName,
      currentVersion: version || '',
      authorId: '',
      teamId,
    };
  } else {
    spinner.start(`Resolving "${displayName}" from Skills Market...`);
    resolved = await marketProvider.resolve(skillName, author);
  }

  if (!resolved) {
    // Market 找不到，如果输入是 author/name 格式，回退到 GitHub shorthand
    if (parsed.marketAuthor && !parsed.marketVersion) {
      spinner.stop(pc.dim('Not found on Skills Market, trying GitHub...'));
      return { fallbackToGitHub: true, installed: false };
    }
    spinner.stop(pc.red('Not found'));
    p.outro(pc.red(`Skill "${displayName}" not found on Skills Market`));
    process.exit(1);
  }

  const resolvedTeamId = teamId || resolved.teamId;
  if (resolvedTeamId && !releaseId && !options.prefetchedMarketSkill) {
    spinner.stop(pc.red('团队版本不完整'));
    p.outro(pc.red(`团队版本不可用：${displayName} 缺少 releaseId`));
    process.exit(1);
  }

  spinner.stop(`Found: ${pc.cyan(resolved.name)} ${pc.dim(`v${resolved.currentVersion}`)}`);

  let skill: MarketSkill;
  if (options.prefetchedMarketSkill) {
    skill = options.prefetchedMarketSkill;
  } else {
    const checked = await resolveExpectedReleaseSeq({
      skillId: resolved.id,
      authorId: resolved.authorId || author,
      teamId: resolvedTeamId,
      releaseId,
    });
    if (!checked.ok) {
      spinner.stop(pc.red('Failed to check build'));
      p.outro(pc.red(`${displayName}：${checked.message}`));
      process.exit(1);
    }
    spinner.start('Downloading skill files...');
    const installResult =
      checked.releaseSeq === undefined
        ? await marketProvider.installById(
            resolved.id,
            checked.version ?? version,
            author,
            resolvedTeamId,
            releaseId
          )
        : await marketProvider.installById(
            resolved.id,
            checked.version ?? version,
            author,
            resolvedTeamId,
            releaseId,
            checked.releaseSeq
          );
    if (!installResult.ok) {
      spinner.stop(pc.red('Failed to fetch skill'));
      p.outro(pc.red(formatInstallFailure(installResult, displayName)));
      process.exit(1);
    }
    skill = installResult.data;
  }

  if (!options.prefetchedMarketSkill) {
    spinner.stop(
      `Skill: ${pc.cyan(skill.installName)} ${pc.dim(`v${skill.version}`)} (${skill.files.size} file${skill.files.size > 1 ? 's' : ''})`
    );
  }
  if (skill.observabilityEnabled) {
    const actualBuildHash = computeBuildHash(skill.files);
    if (!skill.buildHash || actualBuildHash !== skill.buildHash) {
      spinner.stop(pc.red('Build hash mismatch'));
      p.outro(pc.red('下载内容与 Market buildHash 不一致，已中止安装'));
      process.exit(1);
    }
  }

  // Detect agents
  let targetAgents: AgentType[];
  const validAgents = Object.keys(agents);

  if (options.agent?.includes('*')) {
    targetAgents = validAgents as AgentType[];
    p.log.info(`Installing to all ${targetAgents.length} agents`);
  } else if (options.agent && options.agent.length > 0) {
    const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));

    if (invalidAgents.length > 0) {
      p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
      p.log.info(`Valid agents: ${validAgents.join(', ')}`);
      process.exit(1);
    }

    targetAgents = options.agent as AgentType[];
  } else {
    spinner.start('Loading agents...');
    const installedAgents = await detectInstalledAgents();
    const totalAgents = Object.keys(agents).length;
    spinner.stop(`${totalAgents} agents`);

    if (installedAgents.length === 0) {
      if (options.yes) {
        targetAgents = validAgents as AgentType[];
        p.log.info('Installing to all agents');
      } else {
        p.log.info('Select agents to install skills to');

        const allAgentChoices = Object.entries(agents).map(([key, config]) => ({
          value: key as AgentType,
          label: config.displayName,
        }));

        const selected = await promptForAgents(
          'Which agents do you want to install to?',
          allAgentChoices
        );

        if (p.isCancel(selected)) {
          p.cancel('Installation cancelled');
          process.exit(0);
        }

        targetAgents = selected as AgentType[];
      }
    } else if (installedAgents.length === 1 || options.yes) {
      // -y 项目安装时，优先使用项目中已有的 agent 目录
      if (options.yes && !options.global) {
        const projectAgents = await detectProjectAgents();
        if (projectAgents.length > 0) {
          targetAgents = ensureUniversalAgents(projectAgents);
        } else {
          targetAgents = ensureUniversalAgents(installedAgents);
        }
      } else {
        targetAgents = ensureUniversalAgents(installedAgents);
      }
      if (installedAgents.length === 1) {
        const firstAgent = installedAgents[0]!;
        p.log.info(`Installing to: ${pc.cyan(agents[firstAgent].displayName)}`);
      } else {
        p.log.info(
          `Installing to: ${installedAgents.map((a) => pc.cyan(agents[a].displayName)).join(', ')}`
        );
      }
    } else {
      const selected = await selectAgentsInteractive({ global: options.global });

      if (p.isCancel(selected)) {
        p.cancel('Installation cancelled');
        process.exit(0);
      }

      targetAgents = selected as AgentType[];
    }
  }

  let installGlobally = options.global ?? false;

  const supportsGlobal = targetAgents.some((a) => agents[a].globalSkillsDir !== undefined);

  if (options.global === undefined && !options.yes && supportsGlobal) {
    const scope = await p.select({
      message: 'Installation scope',
      options: [
        {
          value: false,
          label: 'Project',
          hint: 'Install in current directory (committed with your project)',
        },
        {
          value: true,
          label: 'Global',
          hint: 'Install in home directory (available across all projects)',
        },
      ],
    });

    if (p.isCancel(scope)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    installGlobally = scope as boolean;
  }

  let installMode: InstallMode = options.copy ? 'copy' : 'symlink';

  if (!options.copy && !options.yes) {
    const modeChoice = await p.select({
      message: 'Installation method',
      options: [
        {
          value: 'symlink',
          label: 'Symlink (Recommended)',
          hint: 'Single source of truth, easy updates',
        },
        { value: 'copy', label: 'Copy to all agents', hint: 'Independent copies for each agent' },
      ],
    });

    if (p.isCancel(modeChoice)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    installMode = modeChoice as InstallMode;
  }

  const cwd = process.cwd();

  // 安装文件来自唯一一次响应；consent 只决定下游统计与 Pilot 引导。
  let writeCollectConsent: boolean | undefined;
  const collectCapable = hasValidCollect(skill);
  const consentTeamId = teamId || resolved.teamId;
  const locked = consentTeamId
    ? await getTeamSkillConsent(consentTeamId, skill.installName, installGlobally, cwd)
    : await getSkillConsent(skill.installName, installGlobally, cwd);

  const recoveryHint = installGlobally
    ? `${BIN_NAME} track on ${skill.installName}`
    : `${BIN_NAME} add ${displayName} --observability`;
  const toggleHint = installGlobally
    ? '可稍后 track 切换'
    : `可稍后运行 ${pc.cyan(`${BIN_NAME} add ${displayName} --observability`)} 开启`;

  if (options.observability === true) {
    writeCollectConsent = true;
    if (!collectCapable) {
      p.log.warn(
        `「${skill.installName}」安装响应不含合法可观测信息；已按 --observability 记录统计同意，安装文件保持本次响应内容。`
      );
    }
  } else if (collectCapable) {
    if (locked === true) {
      writeCollectConsent = true;
    } else if (options.collectConsent !== undefined) {
      writeCollectConsent = options.collectConsent;
    } else {
      const canPrompt =
        process.stdin.isTTY && (!options.yes || options.recheckCollectConsent === true);
      if (!canPrompt) {
        writeCollectConsent = false;
        p.log.message(
          pc.dim(
            `「${skill.installName}」包含可观测文件，非交互安装默认不统计；安装文件不变，可稍后运行 ${pc.cyan(recoveryHint)} 开启统计。`
          )
        );
      } else {
        const confirmed = await p.confirm({
          message:
            locked === false
              ? `「${skill.installName}」上次选择不采集，本次是否改为同意数据采集？(安装文件不变，${toggleHint})`
              : `「${skill.installName}」包含可观测文件，是否同意数据采集？(安装文件不变，${toggleHint})`,
        });
        writeCollectConsent = !p.isCancel(confirmed) && !!confirmed;
      }
    }
  } else if (locked !== 'missing') {
    // 响应不可观测时不改变已有 consent，但 addSkillToLock 会整项替换，需显式携带避免丢失。
    writeCollectConsent = locked;
  }

  // 只有可观测 Skill 且最终同意统计时才引导采集插件。
  if (collectCapable && writeCollectConsent === true && !options.skipPilotStatus) {
    await promptForPilotInstallation(!options.yes);
  }

  // Build installation summary
  const canonicalPath = getCanonicalPath(skill.installName, { global: installGlobally });
  const shortCanonical = shortenPath(canonicalPath, cwd);
  const summaryLines: string[] = [];
  summaryLines.push(`${pc.cyan(shortCanonical)} ${pc.dim(`v${skill.version}`)}`);
  summaryLines.push(...buildAgentSummaryLines(targetAgents, installMode));
  if (skill.files.size > 1) {
    summaryLines.push(`  ${pc.dim('files:')} ${skill.files.size}`);
  }

  console.log();
  p.note(summaryLines.join('\n'), 'Installation Summary');

  if (!options.yes) {
    const confirmed = await p.confirm({ message: 'Proceed with installation?' });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }
  }

  spinner.start('Installing skill...');

  const results: {
    skill: string;
    agent: string;
    success: boolean;
    path: string;
    canonicalPath?: string;
    mode: InstallMode;
    symlinkFailed?: boolean;
    error?: string;
  }[] = [];

  if (installMode === 'copy') {
    const batchResults = await installWellKnownSkillForAgents(skill, targetAgents, {
      global: installGlobally,
      mode: 'copy',
    });
    targetAgents.forEach((agent, index) => {
      const result = batchResults[index] ?? {
        success: false,
        path: '',
        mode: 'copy' as const,
        error: '安装目标为空',
      };
      results.push({
        skill: skill.installName,
        agent: agents[agent].displayName,
        ...result,
      });
    });
  } else {
    for (const agent of targetAgents) {
      const result = await installWellKnownSkillForAgent(skill, agent, {
        global: installGlobally,
        mode: installMode,
      });
      results.push({
        skill: skill.installName,
        agent: agents[agent].displayName,
        ...result,
      });
    }
  }

  spinner.stop('Installation complete');

  console.log();
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Track installation
  const sourceIdentifier = teamSkillId
    ? `ts_${teamSkillId}/${skillName}`
    : teamId
      ? `market/team/${teamId}/${skill.installName}`
      : parsed.marketAuthor
        ? `market/${parsed.marketAuthor}/${skill.installName}`
        : `market/${skill.installName}`;

  track({
    event: 'install',
    source: sourceIdentifier,
    skills: skill.installName,
    agents: targetAgents.join(','),
    ...(installGlobally && { global: '1' }),
    sourceType: 'market',
  });

  // Add to skill lock file for update tracking (only for global installs)
  if (successful.length > 0 && installGlobally) {
    try {
      await addSkillToLock(skill.installName, {
        source: sourceIdentifier,
        sourceType: 'market',
        sourceUrl: skill.sourceUrl,
        skillFolderHash: skill.skillFolderHash,
        skillPath: skill.skillId,
        version: skill.version,
        ...(skill.observabilityEnabled && skill.releaseSeq !== undefined
          ? { releaseSeq: skill.releaseSeq }
          : {}),
        authorId: teamId ? undefined : resolved.authorId,
        ...(teamId ? { teamId } : {}),
        ...(teamSkillId ? { skillTeamId: teamSkillId } : {}),
        ...(releaseId ? { releaseId } : {}),
        ...(teamSkillId ? { teamSkillName: skillName } : {}),
        ...(writeCollectConsent !== undefined ? { collectConsent: writeCollectConsent } : {}),
      });
    } catch {
      // Don't fail installation if lock file update fails
    }
  }

  // Add to local lock file for project-scoped installs
  if (successful.length > 0 && !installGlobally) {
    try {
      const matchingResult = successful.find((r) => r.skill === skill!.installName);
      const installDir = matchingResult?.canonicalPath || matchingResult?.path;
      if (installDir) {
        const computedHash = await computeSkillFolderHash(installDir);
        await addSkillToLocalLock(
          skill.installName,
          {
            source: sourceIdentifier,
            sourceType: 'market',
            computedHash,
            version: skill.version,
            ...(skill.observabilityEnabled && skill.releaseSeq !== undefined
              ? { releaseSeq: skill.releaseSeq }
              : {}),
            skillId: skill.skillId,
            authorId: teamId ? undefined : resolved.authorId,
            ...(teamId ? { teamId } : {}),
            ...(teamSkillId ? { skillTeamId: teamSkillId } : {}),
            ...(releaseId ? { releaseId } : {}),
            ...(teamSkillId ? { teamSkillName: skillName } : {}),
            ...(writeCollectConsent !== undefined ? { collectConsent: writeCollectConsent } : {}),
          },
          cwd
        );
      }
    } catch {
      // Don't fail installation if lock file update fails
    }
  }

  if (successful.length > 0) {
    const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);
    const resultLines: string[] = [];

    const firstResult = successful[0]!;

    if (firstResult.mode === 'copy') {
      resultLines.push(`${pc.green('\u2713')} ${skill.installName} ${pc.dim('(copied)')}`);
      for (const r of successful) {
        const shortPath = shortenPath(r.path, cwd);
        resultLines.push(`  ${pc.dim('\u2192')} ${shortPath}`);
      }
    } else {
      if (firstResult.canonicalPath) {
        const shortPath = shortenPath(firstResult.canonicalPath, cwd);
        resultLines.push(`${pc.green('\u2713')} ${shortPath}`);
      } else {
        resultLines.push(`${pc.green('\u2713')} ${skill.installName}`);
      }
      for (const r of successful) {
        const agentName = r.agent;
        resultLines.push(`  ${pc.dim('\u2192')} ${agentName}`);
      }
    }

    if (symlinkFailures.length > 0) {
      const copiedAgents = symlinkFailures.map((r) => r.agent);
      resultLines.push(
        pc.yellow(`  ⚠ symlink failed for ${formatList(copiedAgents)}, copied instead`)
      );
    }

    p.note(resultLines.join('\n'), 'Installed');
  }

  if (failed.length > 0) {
    console.log();
    p.log.error(pc.red(`Failed to install to ${failed.length} agent(s)`));
    for (const r of failed) {
      p.log.message(`  ${pc.red('\u2717')} ${r.agent}: ${pc.dim(r.error)}`);
    }
  }

  console.log();
  p.outro(
    pc.green('Done!') + pc.dim('  Review skills before use; they run with full agent permissions.')
  );

  return { fallbackToGitHub: false, installed: successful.length > 0 };
}

export async function runAdd(args: string[], options: AddOptions = {}): Promise<void> {
  const source = args[0];
  let installTipShown = false;

  const showInstallTip = (): void => {
    if (installTipShown) return;
    p.log.message(
      pc.dim('Tip: use the --yes (-y) and --global (-g) flags to install without prompts.')
    );
    installTipShown = true;
  };

  if (!source) {
    console.log();
    console.log(
      pc.bgRed(pc.white(pc.bold(' ERROR '))) + ' ' + pc.red('Missing required argument: source')
    );
    console.log();
    console.log(pc.dim('  Usage:'));
    console.log(`    ${pc.cyan(NPX_CMD + ' add')} ${pc.yellow('<source>')} ${pc.dim('[options]')}`);
    console.log();
    console.log(pc.dim('  Example:'));
    console.log(`    ${pc.cyan(NPX_CMD + ' add')} ${pc.yellow(EXAMPLE_REPO)}`);
    console.log();
    process.exit(1);
  }

  // 校验技能名称不包含空格（trim 后仍包含内部空格则拒绝）
  const trimmedSource = source.trim();
  if (trimmedSource.includes(' ')) {
    console.log();
    console.log(
      pc.bgRed(pc.white(pc.bold(' ERROR '))) +
        ' ' +
        pc.red('Skill name cannot contain spaces: ') +
        pc.yellow(`"${source}"`)
    );
    console.log();
    console.log(pc.dim('  Usage:'));
    console.log(`    ${pc.cyan(NPX_CMD + ' add')} ${pc.yellow('<source>')} ${pc.dim('[options]')}`);
    console.log();
    process.exit(1);
  }

  // --all implies --skill '*' and --agent '*' and -y
  if (options.all) {
    options.skill = ['*'];
    options.agent = ['*'];
    options.yes = true;
  }

  console.log();
  p.intro(pc.bgCyan(pc.black(' skills ')));

  if (!process.stdin.isTTY) {
    showInstallTip();
  }

  let tempDir: string | null = null;

  try {
    const spinner = p.spinner();

    spinner.start('Parsing source...');
    const parsed: ParsedSource = parseSource(source);
    spinner.stop(
      `Source: ${parsed.type === 'local' ? parsed.localPath! : parsed.url}${parsed.ref ? ` @ ${pc.yellow(parsed.ref)}` : ''}${parsed.subpath ? ` (${parsed.subpath})` : ''}${parsed.skillFilter ? ` ${pc.dim('@')}${pc.cyan(parsed.skillFilter)}` : ''}`
    );

    // Handle well-known skills from arbitrary URLs
    if (parsed.type === 'well-known') {
      await handleWellKnownSkills(source, parsed.url, options, spinner);
      return;
    }

    // Handle skills from Tencent COS
    if (parsed.type === 'cos') {
      await handleCosSkills(source, parsed.url, options, spinner);
      return;
    }

    // Handle skills from the Skills Market
    if (parsed.type === 'market') {
      // t_<teamId>/<teamName> 格式：批量安装团队全部 skill
      if (parsed.marketAuthor?.startsWith('t_')) {
        const teamId = parsed.marketAuthor.slice(2); // 剥除 t_ 前缀
        const teamName = parsed.marketName || teamId;
        await handleTeamInstall(teamId, teamName, options, spinner);
        return;
      }

      const { fallbackToGitHub } = await handleMarketSkill(source, parsed, options, spinner);
      if (!fallbackToGitHub) return;
      // Market 未找到，回退为 GitHub shorthand（author/name → owner/repo）
      parsed.type = 'github';
      parsed.url = `https://github.com/${parsed.marketAuthor}/${parsed.marketName}.git`;
    }

    let skillsDir: string;

    if (parsed.type === 'local') {
      // Use local path directly, no cloning needed
      spinner.start('Validating local path...');
      if (!existsSync(parsed.localPath!)) {
        spinner.stop(pc.red('Path not found'));
        p.outro(pc.red(`Local path does not exist: ${parsed.localPath}`));
        process.exit(1);
      }
      skillsDir = parsed.localPath!;
      spinner.stop('Local path validated');
    } else {
      // Clone repository for remote sources
      spinner.start('Cloning repository...');
      tempDir = await cloneRepo(parsed.url, parsed.ref);
      skillsDir = tempDir;
      spinner.stop('Repository cloned');
    }

    // If skillFilter is present from @skill syntax (e.g., owner/repo@skill-name),
    // merge it into options.skill
    if (parsed.skillFilter) {
      options.skill = options.skill || [];
      if (!options.skill.includes(parsed.skillFilter)) {
        options.skill.push(parsed.skillFilter);
      }
    }

    // Include internal skills when a specific skill is explicitly requested
    // (via --skill or @skill syntax)
    const includeInternal = !!(options.skill && options.skill.length > 0);

    spinner.start('Discovering skills...');
    const skills = await discoverSkills(skillsDir, parsed.subpath, {
      includeInternal,
      fullDepth: options.fullDepth,
    });

    if (skills.length === 0) {
      spinner.stop(pc.red('No skills found'));
      p.outro(
        pc.red('No valid skills found. Skills require a SKILL.md with name and description.')
      );
      await cleanup(tempDir);
      process.exit(1);
    }

    spinner.stop(`Found ${pc.green(skills.length)} skill${skills.length > 1 ? 's' : ''}`);

    if (options.list) {
      console.log();
      p.log.step(pc.bold('Available Skills'));

      // Group available skills by plugin for list output
      const groupedSkills: Record<string, Skill[]> = {};
      const ungroupedSkills: Skill[] = [];

      for (const skill of skills) {
        if (skill.pluginName) {
          const group = skill.pluginName;
          if (!groupedSkills[group]) groupedSkills[group] = [];
          groupedSkills[group].push(skill);
        } else {
          ungroupedSkills.push(skill);
        }
      }

      // Print groups
      const sortedGroups = Object.keys(groupedSkills).sort();
      for (const group of sortedGroups) {
        // Convert kebab-case to Title Case for display header
        const title = group
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        console.log(pc.bold(title));
        for (const skill of groupedSkills[group]!) {
          p.log.message(`  ${pc.cyan(getSkillDisplayName(skill))}`);
          p.log.message(`    ${pc.dim(skill.description)}`);
        }
        console.log();
      }

      // Print ungrouped
      if (ungroupedSkills.length > 0) {
        if (sortedGroups.length > 0) console.log(pc.bold('General'));
        for (const skill of ungroupedSkills) {
          p.log.message(`  ${pc.cyan(getSkillDisplayName(skill))}`);
          p.log.message(`    ${pc.dim(skill.description)}`);
        }
      }

      console.log();
      p.outro('Use --skill <name> to install specific skills');
      await cleanup(tempDir);
      process.exit(0);
    }

    let selectedSkills: Skill[];

    if (options.skill?.includes('*')) {
      // --skill '*' selects all skills
      selectedSkills = skills;
      p.log.info(`Installing all ${skills.length} skills`);
    } else if (options.skill && options.skill.length > 0) {
      selectedSkills = filterSkills(skills, options.skill);

      if (selectedSkills.length === 0) {
        p.log.error(`No matching skills found for: ${options.skill.join(', ')}`);
        p.log.info('Available skills:');
        for (const s of skills) {
          p.log.message(`  - ${getSkillDisplayName(s)}`);
        }
        await cleanup(tempDir);
        process.exit(1);
      }

      p.log.info(
        `Selected ${selectedSkills.length} skill${selectedSkills.length !== 1 ? 's' : ''}: ${selectedSkills.map((s) => pc.cyan(getSkillDisplayName(s))).join(', ')}`
      );
    } else if (skills.length === 1) {
      selectedSkills = skills;
      const firstSkill = skills[0]!;
      p.log.info(`Skill: ${pc.cyan(getSkillDisplayName(firstSkill))}`);
      p.log.message(pc.dim(firstSkill.description));
    } else if (options.yes) {
      selectedSkills = skills;
      p.log.info(`Installing all ${skills.length} skills`);
    } else {
      // Sort skills by plugin name first, then by skill name
      const sortedSkills = [...skills].sort((a, b) => {
        if (a.pluginName && !b.pluginName) return -1;
        if (!a.pluginName && b.pluginName) return 1;
        if (a.pluginName && b.pluginName && a.pluginName !== b.pluginName) {
          return a.pluginName.localeCompare(b.pluginName);
        }
        return getSkillDisplayName(a).localeCompare(getSkillDisplayName(b));
      });

      // Check if any skills have plugin grouping
      const hasGroups = sortedSkills.some((s) => s.pluginName);

      let selected: Skill[] | symbol;

      if (hasGroups) {
        // Build grouped options for groupMultiselect
        const kebabToTitle = (s: string) =>
          s
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

        const grouped: Record<string, p.Option<Skill>[]> = {};
        for (const s of sortedSkills) {
          const groupName = s.pluginName ? kebabToTitle(s.pluginName) : 'Other';
          if (!grouped[groupName]) grouped[groupName] = [];
          grouped[groupName]!.push({
            value: s,
            label: getSkillDisplayName(s),
            hint: s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description,
          });
        }

        selected = await p.groupMultiselect({
          message: `Select skills to install ${pc.dim('(space to toggle)')}`,
          options: grouped,
          required: true,
        });
      } else {
        const skillChoices = sortedSkills.map((s) => ({
          value: s,
          label: getSkillDisplayName(s),
          hint: s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description,
        }));

        selected = await multiselect({
          message: 'Select skills to install',
          options: skillChoices,
          required: true,
        });
      }

      if (p.isCancel(selected)) {
        p.cancel('Installation cancelled');
        await cleanup(tempDir);
        process.exit(0);
      }

      selectedSkills = selected as Skill[];
    }

    // Kick off security audit fetch early (non-blocking) so it runs
    // in parallel with agent selection, scope, and mode prompts.
    const ownerRepoForAudit = getOwnerRepo(parsed);
    const auditPromise = ownerRepoForAudit
      ? fetchAuditData(
          ownerRepoForAudit,
          selectedSkills.map((s) => getSkillDisplayName(s))
        )
      : Promise.resolve(null);

    let targetAgents: AgentType[];
    const validAgents = Object.keys(agents);

    if (options.agent?.includes('*')) {
      // --agent '*' selects all agents
      targetAgents = validAgents as AgentType[];
      p.log.info(`Installing to all ${targetAgents.length} agents`);
    } else if (options.agent && options.agent.length > 0) {
      const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));

      if (invalidAgents.length > 0) {
        p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
        p.log.info(`Valid agents: ${validAgents.join(', ')}`);
        await cleanup(tempDir);
        process.exit(1);
      }

      targetAgents = options.agent as AgentType[];
    } else {
      spinner.start('Loading agents...');
      const installedAgents = await detectInstalledAgents();
      const totalAgents = Object.keys(agents).length;
      spinner.stop(`${totalAgents} agents`);

      if (installedAgents.length === 0) {
        if (options.yes) {
          targetAgents = validAgents as AgentType[];
          p.log.info('Installing to all agents');
        } else {
          p.log.info('Select agents to install skills to');

          const allAgentChoices = Object.entries(agents).map(([key, config]) => ({
            value: key as AgentType,
            label: config.displayName,
          }));

          // Use helper to prompt with search
          const selected = await promptForAgents(
            'Which agents do you want to install to?',
            allAgentChoices
          );

          if (p.isCancel(selected)) {
            p.cancel('Installation cancelled');
            await cleanup(tempDir);
            process.exit(0);
          }

          targetAgents = selected as AgentType[];
        }
      } else if (installedAgents.length === 1 || options.yes) {
        // Auto-select detected agents + ensure universal agents are included
        // -y 项目安装时，优先使用项目中已有的 agent 目录
        if (options.yes && !options.global) {
          const projectAgents = await detectProjectAgents();
          if (projectAgents.length > 0) {
            targetAgents = ensureUniversalAgents(projectAgents);
          } else {
            targetAgents = ensureUniversalAgents(installedAgents);
          }
        } else {
          targetAgents = ensureUniversalAgents(installedAgents);
        }
        if (installedAgents.length === 1) {
          const firstAgent = installedAgents[0]!;
          p.log.info(`Installing to: ${pc.cyan(agents[firstAgent].displayName)}`);
        } else {
          p.log.info(
            `Installing to: ${installedAgents.map((a) => pc.cyan(agents[a].displayName)).join(', ')}`
          );
        }
      } else {
        const selected = await selectAgentsInteractive({ global: options.global });

        if (p.isCancel(selected)) {
          p.cancel('Installation cancelled');
          await cleanup(tempDir);
          process.exit(0);
        }

        targetAgents = selected as AgentType[];
      }
    }

    let installGlobally = options.global ?? false;

    // Check if any selected agents support global installation
    const supportsGlobal = targetAgents.some((a) => agents[a].globalSkillsDir !== undefined);

    if (options.global === undefined && !options.yes && supportsGlobal) {
      const scope = await p.select({
        message: 'Installation scope',
        options: [
          {
            value: false,
            label: 'Project',
            hint: 'Install in current directory (committed with your project)',
          },
          {
            value: true,
            label: 'Global',
            hint: 'Install in home directory (available across all projects)',
          },
        ],
      });

      if (p.isCancel(scope)) {
        p.cancel('Installation cancelled');
        await cleanup(tempDir);
        process.exit(0);
      }

      installGlobally = scope as boolean;
    }

    // Determine install mode (symlink vs copy)
    let installMode: InstallMode = options.copy ? 'copy' : 'symlink';

    // Only prompt for install mode when there are multiple unique target directories.
    // When all selected agents share the same skillsDir, symlink vs copy is meaningless.
    const uniqueDirs = new Set(targetAgents.map((a) => agents[a].skillsDir));

    if (!options.copy && !options.yes && uniqueDirs.size > 1) {
      const modeChoice = await p.select({
        message: 'Installation method',
        options: [
          {
            value: 'symlink',
            label: 'Symlink (Recommended)',
            hint: 'Single source of truth, easy updates',
          },
          { value: 'copy', label: 'Copy to all agents', hint: 'Independent copies for each agent' },
        ],
      });

      if (p.isCancel(modeChoice)) {
        p.cancel('Installation cancelled');
        await cleanup(tempDir);
        process.exit(0);
      }

      installMode = modeChoice as InstallMode;
    } else if (uniqueDirs.size <= 1) {
      // Single target directory — default to copy (no symlink needed)
      installMode = 'copy';
    }

    const cwd = process.cwd();

    // Build installation summary
    const summaryLines: string[] = [];
    const agentNames = targetAgents.map((a) => agents[a].displayName);

    // Check if any skill will be overwritten (parallel)
    const overwriteChecks = await Promise.all(
      selectedSkills.flatMap((skill) =>
        targetAgents.map(async (agent) => ({
          skillName: skill.name,
          agent,
          installed: await isSkillInstalled(skill.name, agent, { global: installGlobally }),
        }))
      )
    );
    const overwriteStatus = new Map<string, Map<string, boolean>>();
    for (const { skillName, agent, installed } of overwriteChecks) {
      if (!overwriteStatus.has(skillName)) {
        overwriteStatus.set(skillName, new Map());
      }
      overwriteStatus.get(skillName)!.set(agent, installed);
    }

    // Group selected skills for summary
    const groupedSummary: Record<string, Skill[]> = {};
    const ungroupedSummary: Skill[] = [];

    for (const skill of selectedSkills) {
      if (skill.pluginName) {
        const group = skill.pluginName;
        if (!groupedSummary[group]) groupedSummary[group] = [];
        groupedSummary[group].push(skill);
      } else {
        ungroupedSummary.push(skill);
      }
    }

    // Helper to print summary lines for a list of skills
    const printSkillSummary = (skills: Skill[]) => {
      for (const skill of skills) {
        if (summaryLines.length > 0) summaryLines.push('');

        const canonicalPath = getCanonicalPath(skill.name, { global: installGlobally });
        const shortCanonical = shortenPath(canonicalPath, cwd);
        summaryLines.push(`${pc.cyan(shortCanonical)}`);
        summaryLines.push(...buildAgentSummaryLines(targetAgents, installMode));

        const skillOverwrites = overwriteStatus.get(skill.name);
        const overwriteAgents = targetAgents
          .filter((a) => skillOverwrites?.get(a))
          .map((a) => agents[a].displayName);

        if (overwriteAgents.length > 0) {
          summaryLines.push(`  ${pc.yellow('overwrites:')} ${formatList(overwriteAgents)}`);
        }
      }
    };

    // Build grouped summary
    const sortedGroups = Object.keys(groupedSummary).sort();

    for (const group of sortedGroups) {
      const title = group
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      summaryLines.push('');
      summaryLines.push(pc.bold(title));
      printSkillSummary(groupedSummary[group]!);
    }

    if (ungroupedSummary.length > 0) {
      if (sortedGroups.length > 0) {
        summaryLines.push('');
        summaryLines.push(pc.bold('General'));
      }
      printSkillSummary(ungroupedSummary);
    }

    console.log();
    p.note(summaryLines.join('\n'), 'Installation Summary');

    // Await and display security audit results (started earlier in parallel)
    // Wrapped in try/catch so a failed audit fetch never blocks installation.
    try {
      const auditData = await auditPromise;
      if (auditData && ownerRepoForAudit) {
        const securityLines = buildSecurityLines(
          auditData,
          selectedSkills.map((s) => ({
            slug: getSkillDisplayName(s),
            displayName: getSkillDisplayName(s),
          })),
          ownerRepoForAudit
        );
        if (securityLines.length > 0) {
          p.note(securityLines.join('\n'), 'Security Risk Assessments');
        }
      }
    } catch {
      // Silently skip — security info is advisory only
    }

    if (!options.yes) {
      const confirmed = await p.confirm({ message: 'Proceed with installation?' });

      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel('Installation cancelled');
        await cleanup(tempDir);
        process.exit(0);
      }
    }

    spinner.start('Installing skills...');

    const results: {
      skill: string;
      agent: string;
      success: boolean;
      path: string;
      canonicalPath?: string;
      mode: InstallMode;
      symlinkFailed?: boolean;
      error?: string;
      pluginName?: string;
    }[] = [];

    for (const skill of selectedSkills) {
      for (const agent of targetAgents) {
        const result = await installSkillForAgent(skill, agent, {
          global: installGlobally,
          mode: installMode,
        });
        results.push({
          skill: getSkillDisplayName(skill),
          agent: agents[agent].displayName,
          pluginName: skill.pluginName,
          ...result,
        });
      }
    }

    spinner.stop('Installation complete');

    console.log();
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Track installation result
    // Build skillFiles map: { skillName: relative path to SKILL.md from repo root }
    const skillFiles: Record<string, string> = {};
    for (const skill of selectedSkills) {
      // skill.path is absolute, compute relative from tempDir (repo root)
      let relativePath: string;
      if (tempDir && skill.path === tempDir) {
        // Skill is at root level of repo
        relativePath = 'SKILL.md';
      } else if (tempDir && skill.path.startsWith(tempDir + sep)) {
        // Compute path relative to repo root (tempDir), not search path
        // Use forward slashes for telemetry (URL-style paths)
        relativePath =
          skill.path
            .slice(tempDir.length + 1)
            .split(sep)
            .join('/') + '/SKILL.md';
      } else {
        // Local path - skip telemetry for local installs
        continue;
      }
      skillFiles[skill.name] = relativePath;
    }

    // Normalize source to owner/repo format for telemetry
    const normalizedSource = getOwnerRepo(parsed);

    // Preserve SSH URLs in lock files instead of normalizing to owner/repo shorthand.
    // When normalizedSource is used, parseSource() later resolves it to HTTPS,
    // breaking restore for private repos that require SSH authentication.
    const isSSH = parsed.url.startsWith('git@');
    const lockSource = isSSH ? parsed.url : normalizedSource;

    // Only track if we have a valid remote source and it's not a private repo
    if (normalizedSource) {
      const ownerRepo = parseOwnerRepo(normalizedSource);
      if (ownerRepo) {
        // Check if repo is private - skip telemetry for private repos
        const isPrivate = await isRepoPrivate(ownerRepo.owner, ownerRepo.repo);
        // Only send telemetry if repo is public (isPrivate === false)
        // If we can't determine (null), err on the side of caution and skip telemetry
        if (isPrivate === false) {
          track({
            event: 'install',
            source: normalizedSource,
            skills: selectedSkills.map((s) => s.name).join(','),
            agents: targetAgents.join(','),
            ...(installGlobally && { global: '1' }),
            skillFiles: JSON.stringify(skillFiles),
          });
        }
      } else {
        // If we can't parse owner/repo, still send telemetry (for non-GitHub sources)
        track({
          event: 'install',
          source: normalizedSource,
          skills: selectedSkills.map((s) => s.name).join(','),
          agents: targetAgents.join(','),
          ...(installGlobally && { global: '1' }),
          skillFiles: JSON.stringify(skillFiles),
        });
      }
    }

    // Add to skill lock file for update tracking (only for global installs)
    if (successful.length > 0 && installGlobally && normalizedSource) {
      const successfulSkillNames = new Set(successful.map((r) => r.skill));
      for (const skill of selectedSkills) {
        const skillDisplayName = getSkillDisplayName(skill);
        if (successfulSkillNames.has(skillDisplayName)) {
          try {
            // Fetch the folder hash from GitHub Trees API
            let skillFolderHash = '';
            const skillPathValue = skillFiles[skill.name];
            if (parsed.type === 'github' && skillPathValue) {
              const token = getGitHubToken();
              const hash = await fetchSkillFolderHash(
                normalizedSource,
                skillPathValue,
                token,
                parsed.ref
              );
              if (hash) skillFolderHash = hash;
            }

            await addSkillToLock(skill.name, {
              source: lockSource || normalizedSource,
              sourceType: parsed.type,
              sourceUrl: parsed.url,
              ref: parsed.ref,
              skillPath: skillPathValue,
              skillFolderHash,
              pluginName: skill.pluginName,
            });
          } catch {
            // Don't fail installation if lock file update fails
          }
        }
      }
    }

    // Add to local lock file for project-scoped installs
    if (successful.length > 0 && !installGlobally) {
      const successfulSkillNames = new Set(successful.map((r) => r.skill));
      for (const skill of selectedSkills) {
        const skillDisplayName = getSkillDisplayName(skill);
        if (successfulSkillNames.has(skillDisplayName)) {
          try {
            const computedHash = await computeSkillFolderHash(skill.path);
            await addSkillToLocalLock(
              skill.name,
              {
                source: lockSource || parsed.url,
                ref: parsed.ref,
                sourceType: parsed.type,
                computedHash,
              },
              cwd
            );
          } catch {
            // Don't fail installation if lock file update fails
          }
        }
      }
    }

    if (successful.length > 0) {
      const bySkill = new Map<string, typeof results>();

      // Group results by plugin name
      const groupedResults: Record<string, typeof results> = {};
      const ungroupedResults: typeof results = [];

      for (const r of successful) {
        const skillResults = bySkill.get(r.skill) || [];
        skillResults.push(r);
        bySkill.set(r.skill, skillResults);

        // We only need to group once per skill (take the first result for that skill)
        if (skillResults.length === 1) {
          if (r.pluginName) {
            const group = r.pluginName;
            if (!groupedResults[group]) groupedResults[group] = [];
            // We'll store just one entry per skill here to drive the loop
            groupedResults[group].push(r);
          } else {
            ungroupedResults.push(r);
          }
        }
      }

      const skillCount = bySkill.size;
      const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);
      const copiedAgents = symlinkFailures.map((r) => r.agent);
      const resultLines: string[] = [];

      const printSkillResults = (entries: typeof results) => {
        for (const entry of entries) {
          const skillResults = bySkill.get(entry.skill) || [];
          const firstResult = skillResults[0]!;

          if (firstResult.mode === 'copy') {
            // Copy mode: show skill name and list all agent paths
            resultLines.push(`${pc.green('✓')} ${entry.skill} ${pc.dim('(copied)')}`);
            for (const r of skillResults) {
              const shortPath = shortenPath(r.path, cwd);
              resultLines.push(`  ${pc.dim('→')} ${shortPath}`);
            }
          } else {
            // Symlink mode: show canonical path and universal/symlinked agents
            if (firstResult.canonicalPath) {
              const shortPath = shortenPath(firstResult.canonicalPath, cwd);
              resultLines.push(`${pc.green('✓')} ${shortPath}`);
            } else {
              resultLines.push(`${pc.green('✓')} ${entry.skill}`);
            }
            resultLines.push(...buildResultLines(skillResults, targetAgents));
          }
        }
      };

      // Print grouped results
      const sortedResultGroups = Object.keys(groupedResults).sort();

      for (const group of sortedResultGroups) {
        const title = group
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        resultLines.push('');
        resultLines.push(pc.bold(title));
        printSkillResults(groupedResults[group]!);
      }

      if (ungroupedResults.length > 0) {
        if (sortedResultGroups.length > 0) {
          resultLines.push('');
          resultLines.push(pc.bold('General'));
        }
        printSkillResults(ungroupedResults);
      }

      const title = pc.green(`Installed ${skillCount} skill${skillCount !== 1 ? 's' : ''}`);
      p.note(resultLines.join('\n'), title);

      // Show symlink failure warning (only for symlink mode)
      if (symlinkFailures.length > 0) {
        p.log.warn(pc.yellow(`Symlinks failed for: ${formatList(copiedAgents)}`));
        p.log.message(
          pc.dim(
            '  Files were copied instead. On Windows, enable Developer Mode for symlink support.'
          )
        );
      }
    }

    if (failed.length > 0) {
      console.log();
      p.log.error(pc.red(`Failed to install ${failed.length}`));
      for (const r of failed) {
        p.log.message(`  ${pc.red('✗')} ${r.skill} → ${r.agent}: ${pc.dim(r.error)}`);
      }
    }

    console.log();
    p.outro(
      pc.green('Done!') +
        pc.dim('  Review skills before use; they run with full agent permissions.')
    );

    // Prompt for find-skills after successful install
    await promptForFindSkills(options, targetAgents);
  } catch (error) {
    if (error instanceof GitCloneError) {
      p.log.error(pc.red('Failed to clone repository'));
      // Print each line of the error message separately for better formatting
      for (const line of error.message.split('\n')) {
        p.log.message(pc.dim(line));
      }
    } else {
      p.log.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
    showInstallTip();
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  } finally {
    await cleanup(tempDir);
  }
}

// Cleanup helper
async function cleanup(tempDir: string | null) {
  if (tempDir) {
    try {
      await cleanupTempDir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Prompt user to install the find-skills skill after their first installation.
 */
async function promptForFindSkills(
  options?: AddOptions,
  targetAgents?: AgentType[]
): Promise<void> {
  // Skip if already dismissed or not in interactive mode
  if (!process.stdin.isTTY) return;
  if (options?.yes) return;

  try {
    const dismissed = await isPromptDismissed('findSkillsPrompt');
    if (dismissed) return;

    // Check if find-skills is already installed
    const findSkillsInstalled = await isSkillInstalled('find-skills', 'claude-code', {
      global: true,
    });
    if (findSkillsInstalled) {
      // Mark as dismissed so we don't check again
      await dismissPrompt('findSkillsPrompt');
      return;
    }

    console.log();
    p.log.message(pc.dim("One-time prompt - you won't be asked again if you dismiss."));
    const install = await p.confirm({
      message: `Install the ${pc.cyan('find-skills')} skill? It helps your agent discover and suggest skills.`,
    });

    if (p.isCancel(install)) {
      await dismissPrompt('findSkillsPrompt');
      return;
    }

    if (install) {
      // Install find-skills to the same agents the user selected, excluding replit
      await dismissPrompt('findSkillsPrompt');

      // Filter out replit from target agents
      const findSkillsAgents = targetAgents?.filter((a) => a !== 'replit');

      // Skip if no valid agents remain after filtering
      if (!findSkillsAgents || findSkillsAgents.length === 0) {
        return;
      }

      console.log();
      p.log.step('Installing find-skills skill...');

      try {
        // 从 Skills Market 安装 find-skills
        await runAdd(['find-skills'], {
          global: true,
          yes: true,
          agent: findSkillsAgents,
        });
      } catch {
        p.log.warn('Failed to install find-skills. You can try again with:');
        p.log.message(pc.dim(`  ${NPX_CMD} add find-skills -g -y --all`));
      }
    } else {
      // User declined - dismiss the prompt
      await dismissPrompt('findSkillsPrompt');
      p.log.message(pc.dim(`You can install it later with: ${NPX_CMD} add find-skills`));
    }
  } catch {
    // Don't fail the main installation if prompt fails
  }
}

// Parse command line options from args array
export function parseAddOptions(args: string[]): { source: string[]; options: AddOptions } {
  const options: AddOptions = {};
  const source: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-g' || arg === '--global') {
      options.global = true;
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (arg === '-l' || arg === '--list') {
      options.list = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '-a' || arg === '--agent') {
      options.agent = options.agent || [];
      i++;
      let nextArg = args[i];
      while (i < args.length && nextArg && !nextArg.startsWith('-')) {
        options.agent.push(nextArg);
        i++;
        nextArg = args[i];
      }
      i--; // Back up one since the loop will increment
    } else if (arg === '-s' || arg === '--skill') {
      options.skill = options.skill || [];
      i++;
      let nextArg = args[i];
      while (i < args.length && nextArg && !nextArg.startsWith('-')) {
        options.skill.push(nextArg);
        i++;
        nextArg = args[i];
      }
      i--; // Back up one since the loop will increment
    } else if (arg === '--full-depth') {
      options.fullDepth = true;
    } else if (arg === '--copy') {
      options.copy = true;
    } else if (arg === '--observability') {
      options.observability = true;
    } else if (arg === '--recheck-collect-consent') {
      options.recheckCollectConsent = true;
    } else if (arg && !arg.startsWith('-')) {
      source.push(arg);
    }
  }

  return { source, options };
}
