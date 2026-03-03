/**
 * Branding constants for the CLI.
 * All brand-specific strings are centralized here for easy customization.
 */

/** The npm package name */
export const PACKAGE_NAME = 'bmc-skills';

/** The CLI binary command name */
export const BIN_NAME = 'bmc-skills';

/** The npx invocation command */
export const NPX_CMD = `npx ${PACKAGE_NAME}`;

/** The help usage line */
export const USAGE_CMD = `${BIN_NAME} <command> [options]`;

/** The run-update spawnSync command args (used in runUpdate) */
export const SPAWN_ADD_ARGS = ['-y', PACKAGE_NAME, 'add'] as const;

/** Default example repo shown in help/banner (owner/repo format) */
export const EXAMPLE_REPO = 'vercel-labs/agent-skills';

/** Default example repo full GitHub URL */
export const EXAMPLE_REPO_URL = `https://github.com/${EXAMPLE_REPO}`;

/** The skills repo that contains find-skills (owner/repo format) */
export const FIND_SKILLS_REPO = 'vercel-labs/skills';

/** Skills directory website */
export const SKILLS_SITE = 'https://skills.sh';

/** Search API base URL */
export const SEARCH_API_BASE = process.env.SKILLS_API_URL || SKILLS_SITE;

/** Telemetry endpoint URL */
export const TELEMETRY_URL = 'https://add-skill.vercel.sh/t';

/** Security audit API URL */
export const AUDIT_URL = 'https://add-skill.vercel.sh/audit';
