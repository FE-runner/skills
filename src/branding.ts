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
