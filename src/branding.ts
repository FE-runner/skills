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

/** Default example repo shown in help/banner (owner/repo format) */
export const EXAMPLE_REPO = 'vercel-labs/agent-skills';

/** Default example repo full GitHub URL */
export const EXAMPLE_REPO_URL = `https://github.com/${EXAMPLE_REPO}`;

/** Skills Market website and API base URL */
export const SKILLS_SITE = 'http://10.0.0.207:3920';

/** Telemetry endpoint URL */
export const TELEMETRY_URL = 'https://add-skill.vercel.sh/t';

/** Security audit API URL */
export const AUDIT_URL = 'https://add-skill.vercel.sh/audit';
