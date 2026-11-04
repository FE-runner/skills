## 1. Market provider and source contract

- [ ] 1.1 Extend `src/types.ts` `ParsedSource` with optional `marketReleaseId` and add `src/source-parser.test.ts` cases proving `ts_<skillTeamId>/<skillName>` stays in the Market type with the expected author/name segments; malformed-segment rejection is covered by the command handler task; verify the focused source parser tests pass
- [ ] 1.2 Add `TeamSkillInstallTarget` plus `MarketProvider.resolveTeamSkillInstallTarget(skillTeamId, skillName)` using `ApiResult` and the anonymous `/api/team/skill/installTarget` endpoint; verify provider tests cover encoded query parameters, success, 404 and 409 message preservation
- [ ] 1.3 Extend `MarketProvider.fetchById` with optional `releaseId` and include it in the install body only for team requests; verify tests assert `id`, `team`, `version`, `releaseId` and `report` together while existing callers still send their previous body

## 2. Team single Skill command flow

- [ ] 2.1 Add a `ts_` command handler in `src/add.ts` that validates exactly two non-empty segments, rejects any explicit `@version`, calls the team target resolver before generic Market handling, injects the resolved target into the existing single-Skill path, and exits without any GitHub/public/private/team fallback on resolver failure; verify focused `src/add-market-paths.test.ts` tests cover success, malformed source, explicit version, 404, 409 and no fallback
- [ ] 2.2 Extend `handleMarketSkill` to use a `ts_` display label and carry the resolved `releaseId` through the original download, every `report=true` collection probe, and monitored replacement; verify focused tests assert every `fetchById` call receives the same `releaseId`
- [ ] 2.3 Preserve the legacy `t_` batch command and public/private install behavior in the same dispatch order change; verify the existing `src/add-market-paths.test.ts` and team observability tests continue to pass

## 3. Lock and collection context

- [ ] 3.1 Add optional `skillTeamId` and `releaseId` fields to `src/skill-lock.ts` global `SkillLockEntry`, and optional `teamId`, `skillTeamId` and `releaseId` fields to `src/local-lock.ts` `LocalSkillLockEntry`; verify `src/track.test.ts` and `tests/local-lock.test.ts` confirm old lock files remain readable without schema bump
- [ ] 3.2 Write `ts_` install context to global and project locks, using a restorable `ts_<skillTeamId>/<skillName>` source; verify add tests assert team IDs, release ID, version, skill ID and project source
- [ ] 3.3 Update `track list` and `track on/off` to recognize `skillTeamId`, display `ts_`, pass the stored `releaseId`, and preserve the fields on write-back; verify track tests cover new release-bound entries, stale release failure without consent mutation, and legacy `t_` entries without releaseId
- [ ] 3.4 Update `MarketProvider.fetchById` call sites in collection preflight and track flows so `ts_` uses one immutable release context for probe and install; verify targeted collection-consent tests show no version or release drift
- [ ] 3.5 Update `src/cli.ts` and `src/update-source.ts` so `check` resolves `ts_` entries through `skillTeamId + name`, compares `releaseId`/version, and `update` uses a `ts_<skillTeamId>/<skillName>` install source; add focused tests in `src/update-source.test.ts` and a CLI-level market-entry fixture proving regular `marketProvider.check` is not used for `ts_` and resolver failures do not fall back

## 4. User-facing documentation

- [ ] 4.1 Update `src/cli.ts` help and `README.md` to list both `t_` batch and `ts_` single-Skill command forms with distinct descriptions; verify `pnpm dev add --help` shows both entries

## 5. Verification

- [ ] 5.1 Run focused tests for source parsing, Market provider, add paths, lock, track and collection consent; expect all focused suites to pass
- [ ] 5.2 Run `pnpm test -- --run`; expect all tests to pass
- [ ] 5.3 Run `pnpm type-check`; expect exit code 0
- [ ] 5.4 Run `pnpm format`; expect formatting to complete, then run `pnpm format:check` and expect exit code 0
- [ ] 5.5 Run `pnpm build`; expect a successful distributable build
