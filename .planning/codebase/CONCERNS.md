# Codebase Concerns

**Analysis Date:** 2026-04-01

## Tech Debt

**Error Handling Silently Swallows Failures:**
- Issue: Multiple try-catch blocks in critical paths don't log failures, only silently ignore errors
- Files: `src/add.ts` (lines 812-814, 542-544, 1573-1575, 1598-1600), `src/promptForAgents()` (lines 312-314, 345-347), `src/sync.ts` (lines 185-187)
- Impact: When lock file operations fail, skill metadata isn't tracked, making updates unreliable. When agent selection fallback fails, users lose historical preferences without knowing why
- Fix approach: Add debug logging or warnings for lock file failures. At minimum, log when telemetry is skipped or metadata updates fail. Consider using a proper error reporting mechanism instead of silent failures

**Unvalidated Private Repository Access:**
- Issue: Private GitHub repository verification (`isSourcePrivate()`) only checks if a repo is private, doesn't verify user has access. No pre-validation before clone attempt
- Files: `src/add.ts` (lines 16-23), `src/source-parser.ts` (lines 55-70)
- Impact: Installation failures occur only during git clone, creating confusing timeout errors rather than clear permission denied messages. Users with multi-factor auth may see unclear "block timeout" messages
- Fix approach: Implement pre-clone validation that attempts SSH key verification or token check before cloning. Provide better error messages for authentication failures vs timeouts

**Unsafe Symlink Fallback Silently Converts to Copy:**
- Issue: When creating symlinks fails (e.g., Windows permissions, ELOOP), code silently falls back to copying files without user notification in some paths
- Files: `src/installer.ts` (lines 150-215, especially line 212-214), `src/add.ts` (lines 857-865)
- Impact: On Windows without Developer Mode, every symlink fails silently and copies instead. Users don't realize they have duplicated files until disk space issues or update inconsistencies occur. Some command paths show warnings (lines 859-864), but others don't
- Fix approach: Consolidate symlink failure handling. Always warn users. Consider making it explicit option rather than silent fallback

**Git Clone Timeout Error Messages Are Misleading:**
- Issue: 60-second clone timeout produces "block timeout" error message that doesn't clearly indicate it's a network/auth issue
- Files: `src/git.ts` (lines 22-71, especially lines 38-54)
- Impact: Users see "block timeout" and assume network is slow, when often it's actually authentication failure for private repos. The helpful auth messages are only shown if error message contains specific strings that vary by git version
- Fix approach: Improve error detection - try to distinguish auth failures from actual timeouts. Test against multiple git versions to ensure error string matching works reliably

## Known Bugs

**COS URL Pagination May Lose Skills:**
- Symptoms: When COS bucket contains many skills, only first page is fully listed
- Files: `src/providers/cos.ts` (lines 100-400)
- Trigger: COS bucket with >1000 skills or when `IsTruncated` is true but `NextContinuationToken` isn't properly handled
- Workaround: Install skills individually by full COS URL rather than discovering from bucket listing
- Root cause: Pagination logic exists but may not handle all edge cases for COS v2 API responses

**Lock File Version Mismatch Wipes All Data:**
- Symptoms: After updating CLI, all installed skills disappear from lock tracking
- Files: `src/skill-lock.ts` (lines 76-99, especially line 90)
- Trigger: Upgrading to version with new CURRENT_VERSION (currently 3)
- Workaround: Manually reinstall skills
- Root cause: Backwards-incompatible version change (v2 → v3 for skillFolderHash support) completely wipes old lock file instead of migrating data

## Security Considerations

**Telemetry Disabled by Default But Config Unclear:**
- Risk: Telemetry is hardcoded as disabled (`isEnabled()` returns false), but no clear indication to users. Code suggests it's just commented out, which could lead to accidental re-enabling
- Files: `src/telemetry.ts` (lines 78-82), `src/branding.ts` (telemetry URLs)
- Current mitigation: Hardcoded return false, no way to enable via environment variable
- Recommendations: Add explicit comment explaining why telemetry is disabled. If re-enabling, implement proper consent flow. Consider environment variable override only for dev mode with clear warnings

**Private Repo Credentials May Be Exposed in Error Messages:**
- Risk: When git authentication fails, error messages might include repository URLs with embedded credentials (e.g., `https://user:token@github.com/...`)
- Files: `src/add.ts` (line 1651 onward - error message formatting), `src/git.ts` (lines 69)
- Current mitigation: Error messages sanitize URLs somewhat, but not comprehensively
- Recommendations: Implement URL sanitization that removes credentials before logging. Never log full git URLs with embedded tokens. Mask API responses that might contain sensitive data

**Skill File Permissions Not Verified:**
- Risk: When installing skills, file permissions from source are preserved. Malicious skills could set executable bits on unexpected files
- Files: `src/installer.ts` (lines 366-430 - copyDirectory function)
- Current mitigation: None observed
- Recommendations: Consider adding permission normalization for installed skills. Remove execute bits from non-script files. Add security warning during installation

## Performance Bottlenecks

**Slow COS Skill Discovery with Large Buckets:**
- Problem: COS `fetchAllSkills()` makes sequential HTTP requests for each version directory, no batching or parallelization
- Files: `src/providers/cos.ts` (entire file, ~400 lines)
- Cause: List operations → extract versions → list each version sequentially. For buckets with 100+ skills × 5 versions each = 500+ HTTP requests
- Improvement path: Batch COS list operations. Implement concurrent requests with sensible concurrency limit (5-10). Cache version lists. Consider adding optional skill count limit for large buckets

**Node Modules Scanning Uses Sequential Promises.all:**
- Problem: Scanned packages are not processed in parallel for top-level packages, only scoped packages are parallelized
- Files: `src/sync.ts` (lines 92-127)
- Cause: Top-level and scoped packages both iterate through entries, but scoped package processing waits for all top-level packages to complete first
- Improvement path: Restructure to parallelize all package directory processing. For 100+ packages, this could save 5-10 seconds

**Market API Fetch Has No Retry Logic:**
- Problem: Single transient network error fails the entire operation (e.g., finding market skills, search API calls)
- Files: `src/find.ts` (lines 30-58), `src/providers/market.ts` (API fetch calls)
- Cause: No retry mechanism, no exponential backoff for transient failures
- Improvement path: Implement retry with exponential backoff for market API calls. Add jitter to prevent thundering herd. Document retry behavior to users

## Fragile Areas

**Symlink Creation Logic with Multiple Fallback Paths:**
- Files: `src/installer.ts` (lines 150-215), `src/add.ts` (lines 857-865)
- Why fragile: Complex logic for resolving symlink targets through parent directory symlinks (lines 170-175). Platform-specific behavior (junction vs symlink on Windows). Multiple error cases (ELOOP, ENOENT, permissions) trigger different fallbacks
- Safe modification: Add comprehensive test coverage for all combinations of parent symlink states, ELOOP errors, and Windows junction creation. Test on actual Windows with and without Developer Mode. Don't change error detection strings without verifying against multiple git versions
- Test coverage: Tests exist (`tests/installer-symlink.test.ts`) but may not cover all ELOOP edge cases

**Git Clone Error Detection Based on Error Message Strings:**
- Files: `src/git.ts` (lines 38-67)
- Why fragile: Error classification depends on string matching in error messages. Different git versions produce different error text. SSH key setup variations produce different messages (Permission denied vs could not read Username)
- Safe modification: Implement programmatic error detection (exit codes) instead of string matching. Add comprehensive test suite with multiple git versions and error scenarios
- Test coverage: No visible tests for git error scenarios. Manual testing shows variance across environments

**COS Provider URL Parsing with Regex:**
- Files: `src/providers/cos.ts` (lines 88-99, 220-260)
- Why fragile: URL parsing uses hardcoded regex for COS hostname pattern. Regional variations or future AWS regional endpoint changes could break detection. XML parsing uses basic string matching instead of proper XML parser
- Safe modification: Use URL parsing library instead of regex. Implement proper XML parsing for COS responses. Add tests for regional URL variations. Document supported COS regions/versions
- Test coverage: `tests/wellknown-provider.test.ts` exists but COS-specific tests are limited

**Local Lock File Format Evolution:**
- Files: `src/local-lock.ts` (entire file, ~178 lines), `src/skill-lock.ts` (entire file, ~349 lines)
- Why fragile: Two separate lock file formats (local vs global). Version field in skill-lock.ts bumped from v2→v3 without migration path. Fields like `authorId` added recently but optional in some code paths, required in others
- Safe modification: Implement formal migration path for lock file version changes. Before bumping version, implement read path that handles old format and migrates data. Document lock file schema changes. Add explicit version migration functions
- Test coverage: `tests/local-lock.test.ts` exists but migration scenarios not tested

## Scaling Limits

**Node Modules Scanning Linear with Package Count:**
- Current capacity: Can scan ~10,000 packages in node_modules, but sequential processing makes it slow
- Limit: >50,000 packages (monorepo scenarios) will take >30 seconds to scan
- Scaling path: Implement parallelized package scanning. Add progress indicators for long scans. Consider sampling or caching for very large node_modules

**COS Bucket Skill Discovery Not Paginated for Users:**
- Current capacity: COS list operations support pagination but CLI doesn't expose it - shows only first page
- Limit: Buckets with >1000 skills visible will only show first batch
- Scaling path: Implement pagination UI in discovery prompt. Add skill count indicator. Consider lazy-loading skills as user scrolls

**Telemetry Queue Not Bounded:**
- Current capacity: Telemetry disabled, but if re-enabled, no queue size limits observed
- Limit: Long CLI sessions (bulk installs) could queue many telemetry events without limits
- Scaling path: Implement bounded queue (max 100 events). Flush on completion or when full

## Dependencies at Risk

**simple-git No Type Definitions in devDependencies:**
- Risk: `simple-git` is imported but only `@types/node` is listed as dev dependency. Type definitions may lag behind implementation
- Impact: Type checking may miss breaking changes in simple-git updates
- Migration plan: Add explicit `@types/simple-git` if available, or vendor type definitions. Lock simple-git version in package.json to prevent breaking changes

**gray-matter Parsing Untrusted YAML Frontmatter:**
- Risk: `gray-matter` parses SKILL.md frontmatter using YAML, which can execute code if not properly configured
- Files: `src/skills.ts` (parseSkillMd), `src/providers/cos.ts` (parsing skill files)
- Impact: Malicious SKILL.md could execute code during installation
- Mitigation: Verify gray-matter is configured with safe parsing options (no custom constructors)
- Migration plan: Audit gray-matter configuration. Consider switching to JSON-only frontmatter or safer YAML parser

**obuild Build Tool Maintenance Status Unknown:**
- Risk: `obuild ^0.4.22` is a relatively new/small project. Maintenance status unclear
- Impact: New Node.js/TypeScript versions may break builds
- Migration plan: Monitor obuild releases. Have fallback to tsc if obuild is abandoned. Document build process clearly

## Missing Critical Features

**No Skill Dependency Resolution:**
- Problem: Skills can depend on other skills, but no dependency resolution implemented. Manual install order required
- Blocks: Can't install complex skill ecosystems that depend on base skills
- Impact: Users must manually identify and install prerequisites

**No Skill Compatibility Matrix:**
- Problem: No way to specify which agents a skill is compatible with. Skills must work with all agents or none
- Blocks: Skills with agent-specific features can't declare requirements
- Impact: Incompatible skills can be installed, causing runtime errors

**No Skill Update Rollback:**
- Problem: When `skills update` fails partway through, no rollback mechanism exists
- Blocks: Can't safely update in production environments
- Impact: Manual cleanup required after failed updates

## Test Coverage Gaps

**Market Skill Installation Path:**
- What's not tested: Full end-to-end market skill installation with real Market API responses. The `handleMarketSkill()` function (lines 1400-1652 in add.ts) has complex error handling and private repo detection not covered
- Files: `src/add.ts` (handleMarketSkill function), market provider integration
- Risk: Breaking changes to market API would not be caught until production
- Priority: High - market skills are primary installation path

**Private Repository Authentication:**
- What's not tested: Actual git clone attempts with private repos. SSH key validation. Multi-factor auth scenarios. Different git credential helpers (git-credential-store, SSH agents, GitHub CLI)
- Files: `src/git.ts` (cloneRepo), `src/add.ts` (isSourcePrivate checks)
- Risk: Private repo installation fails silently in production with confusing timeout messages
- Priority: High - blocks enterprise adoption

**Windows Symlink Fallback Scenarios:**
- What's not tested: Windows Developer Mode disabled scenarios. ELOOP errors from circular symlink situations. Permissions errors when not running as admin
- Files: `src/installer.ts` (createSymlink)
- Risk: Silent file copying instead of symlinking leads to disk space issues and stale copies
- Priority: Medium - Windows users affected, but can work around with --copy flag

**COS Provider Error Scenarios:**
- What's not tested: Network errors during COS list operations. Truncated responses with missing NextContinuationToken. Malformed SKILL.md files in COS. Version resolution when versions directory structure is unexpected
- Files: `src/providers/cos.ts` (entire provider)
- Risk: COS skill discovery silently fails or hangs without clear error message
- Priority: Medium - COS is BMC-specific integration

**Telemetry Re-enabling Edge Cases:**
- What's not tested: Telemetry rate limiting. Network failures during telemetry flush. Sensitive data leakage through telemetry (private repo URLs, credentials)
- Files: `src/telemetry.ts`, `src/add.ts` (track() calls)
- Risk: If telemetry is re-enabled without proper testing, credentials could leak
- Priority: Medium - only if telemetry is actually enabled

---

*Concerns audit: 2026-04-01*
