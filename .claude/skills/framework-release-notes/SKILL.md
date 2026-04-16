---
name: framework-release-notes
description: Generate release notes for the Aztec developer framework (aztec-nr, aztec.js, PXE, wallet-sdk, CLI, etc.) by analyzing commits in a git range filtered to framework-relevant paths, fetching PR details from GitHub, and producing polished release notes grouped by component.
---

# Framework Release Notes

Generate high-quality release notes for the Aztec developer framework by analyzing commits filtered to framework-relevant code paths.

## When to Use

- User asks for release notes, changelog, or "what changed" for the framework
- Preparing a release summary for ecosystem teams
- Reviewing what shipped between two points in time

## Framework Paths

These are the paths that constitute the "developer framework" -- the surface area that ecosystem teams and contract developers interact with:

```
# Noir (contract-side)
noir-projects/aztec-nr/                    # Core Noir framework (macros, state vars, oracles, notes, events, authwit, keys)
noir-projects/noir-contracts/contracts/    # Reference contracts (token, fpc, auth_registry, etc.)

# TypeScript (client-side)
yarn-project/aztec.js/                     # Client SDK
yarn-project/pxe/                          # Private Execution Environment
yarn-project/wallet-sdk/                   # Wallet SDK
yarn-project/accounts/                     # Account contract implementations (schnorr, ecdsa, etc.)
yarn-project/entrypoints/                  # Transaction entrypoint encoding
yarn-project/txe/                          # Test Execution Environment (Noir test server)

# CLI
yarn-project/cli/                          # aztec CLI commands
yarn-project/cli-wallet/                   # CLI wallet

# Supporting packages commonly used by dApp developers
yarn-project/aztec/                        # Meta-package / local sandbox orchestration
yarn-project/constants/                    # Shared protocol constants (Noir + TS)
```

## Branch Topology

This repo has multiple long-lived branches with different roles:

| Branch           | Role                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `next`           | Main development branch (default branch, target for most PRs)                             |
| `v4`             | Stable v4 release branch (receives backports from v4-next)                                |
| `origin/v4-next` | Staging branch for v4 backports (accumulated backports land here first, then merge to v4) |
| `merge-train/*`  | Team-specific batching branches targeting `next`                                          |

**Release tags** (e.g., `v4.2.0-aztecnr-rc.2`) are typically cut from `origin/v4-next` or `v4`, NOT from `next`. Always verify which branch a tag lives on:

```bash
# Check which branches contain the tag
git branch -a --contains <tag> | head -10
# Or check the tag's commit directly
git log --oneline -1 <tag>
```

When the user specifies a tag as the starting point, determine the correct target:

- If the tag is on `origin/v4-next` → use `<tag>..origin/v4-next` as the range
- If the tag is on `v4` → use `<tag>..v4`
- If the tag is on `next` → use `<tag>..next`
- If unclear, ask the user which branch they want release notes for

## Steps

### 1. Determine the Git Range

Ask the user for the range if not provided. Common patterns:

- Between two tags: `v4.0.0..v4.1.0`
- Since a tag to its branch tip: `v4.0.0..origin/v4-next`
- Since a date: use `git log --after="2026-03-15" --format=%H | tail -1` to find the starting commit
- Between branches: `next..v4`

If the user says something like "since last release" or "what's new", check recent tags:

```bash
git tag --sort=-creatordate | head -10
```

**Important:** Always verify the tag exists and check its date to set expectations:

```bash
git log --oneline -1 <tag> --format='%ci'
```

### 2. Gather Commits

Use `scripts/commits` with the framework paths and markdown + group-by-type flags.

**Important:** The `limit` (e.g., `500`) is a positional arg that MUST come immediately after the ref/range, before any flags. Also use `--no-first-parent` because backport branches use accumulated merge commits that hide individual changes behind a single "chore: Accumulated backports" entry.

```bash
python3 scripts/commits '<range>' 500 -m -g --no-first-parent \
  --paths 'noir-projects/aztec-nr/' \
  --paths 'noir-projects/noir-contracts/contracts/' \
  --paths 'yarn-project/aztec.js/' \
  --paths 'yarn-project/pxe/' \
  --paths 'yarn-project/wallet-sdk/' \
  --paths 'yarn-project/accounts/' \
  --paths 'yarn-project/entrypoints/' \
  --paths 'yarn-project/txe/' \
  --paths 'yarn-project/cli/' \
  --paths 'yarn-project/cli-wallet/' \
  --paths 'yarn-project/aztec/' \
  --paths 'yarn-project/constants/'
```

The `500` limit ensures you capture all commits in the range. Adjust if needed.

The output will be grouped by type (Breaking Changes, Features, Fixes, Refactors, etc.) with PR links.

**If the result shows very few commits** (< 5), the range may be too narrow. Check the dates of both endpoints and tell the user how much time the range covers. Offer to expand the range (e.g., use an earlier tag or a date-based starting point).

**If the result is empty but the range is non-trivial**, try without `--no-first-parent` -- the commits may all be direct pushes rather than merges. If still empty, the range endpoints may be on divergent branches (see Branch Topology above).

### 3. Fetch PR Details for Important Changes

For each PR in the **Breaking Changes** and **Features** sections, fetch the PR description:

```bash
gh pr view <PR_NUMBER> --json title,body,labels,files --jq '{title, body: .body[0:2000], labels: [.labels[].name], files: [.files[].path[0:80]]}'
```

Use the PR body to understand the intent and user-facing impact. The commit message alone is often insufficient for release notes.

For **Fixes**, only fetch PR details if the commit message is unclear.

Skip fetching for **Chores**, **Refactors**, **Tests**, **CI**, and **Docs** unless they have user-facing impact.

### 4. Classify by Component

Reclassify each change by the framework component it affects. Use the file paths from the commit or PR to determine:

| Component Tag           | Paths                                                 |
| ----------------------- | ----------------------------------------------------- |
| `[Aztec.nr]`            | `noir-projects/aztec-nr/`                             |
| `[Reference Contracts]` | `noir-projects/noir-contracts/contracts/`             |
| `[aztec.js]`            | `yarn-project/aztec.js/`                              |
| `[PXE]`                 | `yarn-project/pxe/`                                   |
| `[Wallet SDK]`          | `yarn-project/wallet-sdk/`                            |
| `[Accounts]`            | `yarn-project/accounts/`, `yarn-project/entrypoints/` |
| `[TXE]`                 | `yarn-project/txe/`                                   |
| `[CLI]`                 | `yarn-project/cli/`, `yarn-project/cli-wallet/`       |
| `[Constants]`           | `yarn-project/constants/`                             |

A single PR may touch multiple components -- tag it with all relevant ones.

### 5. Draft Release Notes

Present a draft to the user in this format:

```markdown
# Framework Release Notes: <range or version>

**Date:** <today>
**Commits:** <count> framework-relevant commits

## Breaking Changes

- **[Component]** Description of what changed and what developers need to do. ([#PR](url))

## New Features

- **[Component]** Description of the feature and why it matters. ([#PR](url))

## Bug Fixes

- **[Component]** What was broken and how it's fixed. ([#PR](url))

## Improvements

- **[Component]** Refactors, performance improvements, or DX improvements worth noting. ([#PR](url))

## Internal / Infrastructure

_Changes that don't directly affect framework users but are worth noting:_

- Brief description ([#PR](url))
```

**Writing guidelines:**

- Lead with the user impact, not the implementation detail
- For breaking changes, ensure they are covered in docs/docs-developers/docs/resources/migration_notes.md and link there if so
- Skip commits that are purely internal (test infra, CI, typo fixes) unless the user asks for exhaustive notes
- Combine related commits (e.g., "feat: add X" + "fix: fix X edge case" = one entry)
- Use present tense ("Adds", "Fixes", "Removes")
- Keep each bullet to 1-2 sentences max

### 6. Review and Finalize

Present the draft and ask if the user wants to:

- Adjust any descriptions
- Include/exclude specific items
- Add context for specific changes
- Write the output to a file

Only write to a file after the user approves the draft.

## Tips

- If the range has very many commits (>100 framework-relevant), consider summarizing by component first, then expanding on request.
- The `scripts/commits` `--grep` flag can further filter: `--grep 'feat|fix'` for user-facing changes only.
- For cross-referencing with migration notes, check `docs/docs-developers/docs/resources/migration_notes.md` -- some changes may already be documented there.
- If a commit references a backport (e.g., "backport #XXXX"), fetch the original PR for the full context.
