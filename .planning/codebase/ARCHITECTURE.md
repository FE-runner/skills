# Architecture

**Analysis Date:** 2026-04-01

## Pattern Overview

**Overall:** Multi-layered CLI with provider-based skill resolution, agent-agnostic skill distribution, and dual lock file management.

**Key Characteristics:**
- Provider pattern for multi-source skill resolution (GitHub, Market, COS, well-known)
- Agent discovery and adaptive skill installation (symlink/copy)
- Dual lock system: global (`~/.agents/.skill-lock.json`) for installed skills, local (`skills-lock.json`) for committed skills
- Security-first with audit data display and sanitized file paths
- Cross-platform installation with universal agent concept

## Layers

**Presentation / CLI:**
- Purpose: Command routing, user I/O, banner/help rendering
- Location: `src/cli.ts`
- Contains: Main command dispatcher, help text, banner display
- Depends on: All command modules
- Used by: Entry point, shell execution

**Command Layer:**
- Purpose: Implement individual CLI commands
- Location: `src/add.ts`, `src/list.ts`, `src/remove.ts`, `src/find.ts`, `src/install.ts`, `src/sync.ts`
- Contains: Command-specific logic, user prompts, validation
- Depends on: Installer, Provider, Lock files, Agents
- Used by: CLI dispatcher

**Discovery & Resolution:**
- Purpose: Find and parse skills from various sources
- Location: `src/skills.ts`, `src/source-parser.ts`, `src/providers/`
- Contains: Skill discovery from directories, source URL parsing, provider matching
- Depends on: Types, Constants
- Used by: Add command, Find command

**Provider Layer:**
- Purpose: Abstract skill fetching from different hosts
- Location: `src/providers/index.ts`, `src/providers/types.ts`, `src/providers/wellknown.ts`, `src/providers/cos.ts`, `src/providers/market.ts`
- Contains: `HostProvider` interface, concrete implementations (WellKnown, COS, Market)
- Depends on: Source parser, Telemetry
- Used by: Add command, Discovery

**Installation & Filesystem:**
- Purpose: Physical skill installation to agent directories
- Location: `src/installer.ts`, `src/git.ts`, `src/plugin-manifest.ts`
- Contains: Symlink/copy logic, security validation, path resolution, Git cloning
- Depends on: Agents, Types, Constants
- Used by: Add command, Sync command, Install-from-lock

**Agent Management:**
- Purpose: Define agents and their skill locations
- Location: `src/agents.ts`, `src/constants.ts`
- Contains: AgentConfig for 40+ agent types (claude-code, cursor, cline, etc.), platform-specific paths
- Depends on: Types
- Used by: Installer, List command

**State Management (Lock Files):**
- Purpose: Track installed skills and enable updates/recovery
- Location: `src/skill-lock.ts` (global), `src/local-lock.ts` (project-scoped)
- Contains: Lock file read/write, hash computation, GitHub hash fetching
- Depends on: Git operations, Types
- Used by: Add command, Check/Update commands, List command

**Utilities:**
- Purpose: Cross-cutting concerns
- Location: `src/branding.ts`, `src/telemetry.ts`, `src/prompts/search-multiselect.ts`, `src/constants.ts`
- Contains: Branded URLs, telemetry tracking, custom prompts, shared constants
- Depends on: Types

## Data Flow

**Skill Installation Flow (skills add):**

1. **Parse source** → `source-parser.ts` converts user input (URL/owner/repo/@skill syntax) to `ParsedSource`
2. **Detect agents** → `agents.ts` queries for installed agents on user's system
3. **Fetch skills** → Provider (GitHub/COS/Market) downloads SKILL.md files
4. **Parse metadata** → `skills.ts` extracts name/description from YAML frontmatter
5. **Prompt user** → Multiselect UI for choosing skills and target agents
6. **Validate paths** → `sanitizeName()` prevents path traversal attacks
7. **Install files** → `installer.ts` creates symlinks or copies files to agent directories
8. **Update locks** → Both global lock (`skill-lock.ts`) and local lock (`local-lock.ts`) record metadata
9. **Track telemetry** → `telemetry.ts` sends anonymous usage data

**Skill Discovery Flow (skills find):**

1. **Search API** → Query `/api/search?q=<query>&limit=10` on market platform
2. **Parse results** → Extract skill name, slug, source, install count
3. **Interactive selection** → Custom readline-based picker (fzf-style)
4. **Fetch security data** → Async retrieve audit info (ATH, Socket, Snyk)
5. **Confirm & install** → Route selected skill to add command

**Lock File Management:**

```
Global Lock (~/.agents/.skill-lock.json):
  - Persists across projects
  - Records GitHub tree SHA (skillFolderHash) for version detection
  - Used for `skills check` and `skills update -g`
  - Auto-wiped if version < CURRENT_VERSION (backwards incompatible changes)

Local Lock (./skills-lock.json):
  - Committed to version control
  - Stores computed hash of skill files on disk
  - Deterministic JSON (alphabetically sorted skills) to minimize merge conflicts
  - Used for `skills experimental_install` to restore skills

Both track: source, sourceType, version, authorId (for market skills)
```

**Update Check Flow:**

1. **Read locks** → Fetch both global and local lock files
2. **For each skill:**
   - GitHub skills: Fetch latest tree SHA from GitHub API
   - Market skills: Call `marketProvider.check()` for version info
3. **Compare hashes** → If hash or version differs, add to update list
4. **Display & prompt** → Show available updates, offer `skills update`
5. **Reinstall** → Execute `skills add <url> -g -y` for each update

## Key Abstractions

**ParsedSource:**
- Purpose: Normalized representation of where a skill comes from
- Examples: `src/types.ts` lines 66-82
- Pattern: Discriminated union via `type` field ('github' | 'gitlab' | 'git' | 'local' | 'well-known' | 'cos' | 'market')
- Supports: GitHub URLs, owner/repo shorthand, local paths, well-known registry, Market platform, COS storage

**HostProvider:**
- Purpose: Abstract interface for fetching skills from remote hosts
- Examples: `WellKnownProvider` (mintlify registry), `CosProvider` (Tencent COS), `MarketProvider` (internal platform)
- Pattern: Concrete implementations define `match()`, `fetchSkill()`, `toRawUrl()`, `getSourceIdentifier()`
- Used by: Add command to resolve skills without hardcoding host logic

**Skill / RemoteSkill:**
- Purpose: Represent a skill with metadata and file contents
- Examples: `src/types.ts` lines 44-104
- Pattern: `Skill` (local filesystem), `RemoteSkill` (fetched from remote host)
- Contains: name, description, path/content, metadata from frontmatter

**AgentConfig:**
- Purpose: Define where an agent stores skills and how to detect it
- Examples: `src/agents.ts` lines 29-300+
- Pattern: Each agent has skillsDir (project), globalSkillsDir (user-level), detectInstalled() check
- Used by: Installer to choose symlink/copy targets

**InstallMode:**
- Purpose: Strategy for putting skills where agents can find them
- Examples: `'symlink'` (default, saves space) or `'copy'` (for Windows/sandboxed agents)
- Pattern: Symlink attempted first, falls back to copy on Windows or if symlink fails

## Entry Points

**CLI Entry Point:**
- Location: `src/cli.ts` line 629, function `main()`
- Triggers: `blueai-skills <command> [args]` shell invocation
- Responsibilities: Parse command, route to handler, show banner/help

**Package Bin:**
- Location: `bin/cli.mjs` (generated by obuild from `src/cli.ts`)
- Triggers: `npm install -g blueai-skills` installs to PATH
- Responsibilities: Shebang + require/import of compiled CLI

**Add Command Entry:**
- Location: `src/add.ts` line 157+, function `runAdd(source, options)`
- Triggered by: `skills add <package> [options]`
- Responsibilities: Parse source, detect agents, fetch skills, prompt user, install

**Find Command Entry:**
- Location: `src/find.ts` line 220+, function `runFind(args)`
- Triggered by: `skills find [query]`
- Responsibilities: Search API, interactive picker, install selected

**Async Commands:**
- Location: `src/cli.ts` lines 690-694 (check/update)
- Functions: `runCheck()`, `runUpdate()`
- Responsibilities: Read locks, fetch updates, display results

## Error Handling

**Strategy:** Try/catch at command level, descriptive user feedback, telemetry logging, fallback behaviors.

**Patterns:**

- **Symlink fallback** (`src/installer.ts` lines 149-240): If symlink fails (Windows, permissions), automatically try copy mode
- **Git clone errors** (`src/git.ts`): Wrap git errors in `GitCloneError`, cleanup temp directories
- **Lock file corruption** (`src/skill-lock.ts` lines 76-98): Return empty lock if parse/version fails, avoid crashing
- **Provider mismatches** (`src/providers/index.ts`): If URL doesn't match any provider, default to GitHub
- **Audit data missing** (`src/add.ts` lines 109-151): Gracefully degrade if security audit unavailable, show `--` placeholders
- **Path traversal** (`src/installer.ts` lines 45-60): `sanitizeName()` removes `../`, leading dots, special chars before filesystem operations

## Cross-Cutting Concerns

**Logging:** Console output via `picocolors` (PC) for colored terminal text. Levels: DIM (secondary), TEXT (primary), BOLD, CYAN, YELLOW. No file logging.

**Validation:** Path safety checks (`isPathSafe()`), YAML frontmatter parsing (`gray-matter`), skill name filtering (`filterSkills()` fuzzy match), sanitization (`sanitizeName()`).

**Authentication:** GitHub token sourced from env vars (`GITHUB_TOKEN`, `GH_TOKEN`) or `gh` CLI auth token. Used for API rate limits and private repo access.

**Telemetry:** Anonymous tracking via `telemetry.ts`. Tracks: command type, skill count, source, agent types. Disabled by default (can be opted out). Data sent to telemetry server.

**Security:** Audit display from partner scanners (ATH, Socket, Snyk). Shown during `skills add` to warn of risky packages. Risk levels: critical, high, medium, low, safe.

---

*Architecture analysis: 2026-04-01*
