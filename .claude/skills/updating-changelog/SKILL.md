---
name: updating-changelog
description: Updates changelog documentation for contract developers and node operators by analyzing branch changes relative to 'next'. Use when preparing a PR, updating migration notes, documenting breaking changes, or when asked to update changelog/release notes.
---

# Updating Changelog

The docs live in this repository's `docs/`. The code they describe is mostly aztec-node's,
checked out here as `labs/` (its version and its changes are read inside `labs/`), plus this
repository's own code (`l1-contracts/`, `barretenberg/`, …).

## Steps

### 1. Determine Target Files

The version is the Labs release that `labs/` is pinned to:

```bash
jq -r '."."' labs/.release-please-manifest.json
```

`6.0.0` → edit `v6.md`. The release-please manifest at the repository root versions the
Foundation tree (`7.0.0` while Labs is on v6): never take the version from it.

**Target files:**

- Aztec contract developers: `docs/docs-developers/docs/resources/migration_notes.md`
- Node operators and Ethereum contract developers: `docs/docs-operate/operators/reference/changelog/v{major}.md`

When that file is new (the first entry of a major), two more files must be updated or
the page ships unreachable:

- `docs/docs-operate/operators/reference/changelog/index.md`: add a
  `### [<version>](./<page>.md)` entry at the top of `## Version history`. The heading
  is the release (`v6.0.0`, `v5.2.0`, `v4.3.x`); the link target is the page's **actual
  filename**, which is not derived from the heading. Page names vary by how many
  releases a major has needed: `v6.md`, `v5.2.md`, `v4.3.md`, `v4.2.md`, `v4.md`,
  `v2.0.2.md` all exist. Copy the filename you created; do not construct it from the
  version. `docusaurus.config.js` sets `onBrokenMarkdownLinks: "throw"`, so a link to a
  page that does not exist fails the build.
- `docs/sidebars-operate.js`: add `"operators/reference/changelog/<page>"` (the same
  filename, without `.md`) to the changelog list. The sidebar enumerates these pages
  explicitly; an unlisted page is published but has no nav entry.

### 2. Analyze Branch Changes

The base is `origin/next` (`git fetch origin next` first). Three sources, each read where it
lives:

1. **This repository's own changes** (Foundation code, and the docs already written):

   ```bash
   git diff origin/next...HEAD --stat -- . ':!labs'
   git diff origin/next...HEAD -- . ':!labs'
   ```

2. **Labs code, when this branch moves the `labs/` pin.** The root diff shows only a
   `Subproject commit` line for it; read the range inside `labs/`. Both commits must be in
   the shallow clone, and a two-commit diff needs no history between them:

   ```bash
   old=$(git rev-parse "$(git merge-base origin/next HEAD):labs")
   new=$(git rev-parse HEAD:labs)
   git -C labs fetch --depth 1 origin "$old" "$new"
   git -C labs diff --stat "$old" "$new"
   git -C labs diff "$old" "$new" -- yarn-project/ noir-projects/ <other paths>
   gh api "repos/aztec-labs-eng/aztec-node/compare/$old...$new" \
     --jq '.total_commits, (.commits[].commit.message | split("\n")[0])'
   gh api "repos/aztec-labs-eng/aztec-node/compare/$old...$new" \
     --jq '.commits[].commit.message | select(test("!:"))'
   ```

   aztec-node marks breaking changes only with the conventional-commit `!` (`feat!:`,
   `feat(txe)!:`), never a `BREAKING CHANGE:` trailer. The second command prints every
   message containing `!:`, bodies included: port commits (`chore: port … from monorepo`)
   list the breaking commits they carry only in their body. The compare API lists at most
   250 commits; when `total_commits` is larger, list the PRs merged between the two
   commits' dates instead, and keep only those the diff confirms:

   ```bash
   from=$(git -C labs log -1 --format=%cs "$old") to=$(git -C labs log -1 --format=%cs "$new")
   gh pr list --repo aztec-labs-eng/aztec-node --state merged --limit 1000 \
     --search "merged:$from..$to" --json number,title --jq '.[] | "\(.number) \(.title)"'
   ```

3. **One aztec-node PR**, when asked to document a change that has not reached the pin yet:

   ```bash
   gh pr view <PR_NUMBER> --repo aztec-labs-eng/aztec-node --json title,body,files,url
   gh pr diff <PR_NUMBER> --repo aztec-labs-eng/aztec-node
   ```

**Categorize changes:**

- Breaking changes (API modifications, removals, renames)
- New features (APIs, CLI flags, configuration)
- Deprecations
- Configuration changes (CLI flags, environment variables)

### 3. Generate Draft Entries

Present draft entries for review BEFORE editing files. Match the formatting conventions by
reading existing entries in each file.

### 4. Edit Documentation

After approval, add entries to the appropriate files in this repository's `docs/` (never
under `labs/`, and never a versioned snapshot).

## Migration Notes Format

**File:** `docs/docs-developers/docs/resources/migration_notes.md`

Add entries under `## TBD` section:

````markdown
### [Component] Brief description

Explanation of what changed.

**Migration:**

```diff
- old code
+ new code
```
````

**Impact**: Effect on existing code.

**Component tags:** `[Aztec.nr]`, `[Aztec.js]`, `[PXE]`, `[Aztec Node]`, `[AVM]`, `[L1 Contracts]`, `[CLI]`

## Node Operator Changelog Format

**File:** `docs/docs-operate/operators/reference/changelog/v{major}.md`

**Breaking changes:**
````markdown
### Feature Name

**v{previous}:**
```bash
--old-flag <value>                    ($OLD_ENV_VAR)
```

**v{current}:**
```bash
--new-flag <value>                    ($NEW_ENV_VAR)
```

**Migration**: How to migrate.
````

**New features:**
````markdown
### Feature Name

```bash
--new-flag <value>                    ($ENV_VAR)
```

Description of the feature.
````

**Changed defaults:** Use table format with Flag, Environment Variable, Previous, New columns.
