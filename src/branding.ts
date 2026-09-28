/**
 * Branding constants for the CLI.
 * All brand-specific strings are centralized here for easy customization.
 */

/** The npm package name */
export const PACKAGE_NAME = 'blueai-skills';

/** The CLI binary command name */
export const BIN_NAME = 'blueai-skills';

/**
 * npm dist-tag used in displayed npx commands.
 * dev 构建由 build.config.mjs 注入 'dev'；正式构建保持 'latest'。
 */
const NPX_TAG = process.env.BLUEAI_NPX_TAG ?? 'latest';

/** The npx invocation command */
export const NPX_CMD = `npx ${PACKAGE_NAME}@${NPX_TAG}`;

/** The help usage line */
export const USAGE_CMD = `${BIN_NAME} <command> [options]`;

/** Default example shown in help/banner (market skill name) */
export const EXAMPLE_REPO = 'a2ui-components';

/**
 * Skills Market website and API base URL.
 * dev 构建由 build.config.mjs 注入内网测试市场；正式构建注入生产市场。
 */
const DEFAULT_SKILLS_SITE =
  process.env.SKILLS_DEFAULT_SITE ?? 'https://blueai-skills-market.bluemediagroup.cn';

export const SKILLS_SITE = process.env.SKILLS_SITE ?? DEFAULT_SKILLS_SITE;

/** Telemetry endpoint URL */
export const TELEMETRY_URL = 'https://add-skill.vercel.sh/t';

/** Security audit API URL */
export const AUDIT_URL = 'https://add-skill.vercel.sh/audit';
