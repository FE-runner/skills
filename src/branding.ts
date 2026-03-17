/**
 * Branding constants for the CLI.
 * All brand-specific strings are centralized here for easy customization.
 */

/** The npm package name */
export const PACKAGE_NAME = 'blueai-skills';

/** The CLI binary command name */
export const BIN_NAME = 'blueai-skills';

/** The npx invocation command */
export const NPX_CMD = `npx ${PACKAGE_NAME}@latest`;

/** The help usage line */
export const USAGE_CMD = `${BIN_NAME} <command> [options]`;

/** Default example shown in help/banner (market skill name) */
export const EXAMPLE_REPO = 'a2ui-components';

/** Skills Market website and API base URL */
export const SKILLS_SITE = 'https://blueai-skills-market.bluemediagroup.cn';

/** Telemetry endpoint URL */
export const TELEMETRY_URL = 'https://add-skill.vercel.sh/t';

/** Security audit API URL */
export const AUDIT_URL = 'https://add-skill.vercel.sh/audit';
