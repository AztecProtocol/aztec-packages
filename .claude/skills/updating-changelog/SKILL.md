---
name: updating-changelog
description: Updates changelog documentation for contract developers and node operators by analyzing branch changes relative to 'main'. Use when preparing a PR, updating migration notes, documenting breaking changes, or when asked to update changelog/release notes.
---

# Updating Changelog

## Steps

### 1. Determine Target Files

Read `.release-please-manifest.json` to get the version (e.g., `{"." : "4.0.0"}` → edit `v4.md`).

**Target files:**

- Aztec contract developers: `docs/docs-developers/docs/resources/migration_notes.md`
- Node operators and Ethereum contract developers: `docs/docs-operate/operators/reference/changelog/v{major}.md`

When that file is new (the first entry of a major), two more files must be updated or
the page ships unreachable:

- `docs/docs-operate/operators/reference/changelog/index.md` — add a
  `### [<version>](./<page>.md)` entry at the top of `## Version history`. The heading
  is the release (`v6.0.0`, `v5.2.0`, `v4.3.x`); the link target is the page's **actual
  filename**, which is not derived from the heading. Page names vary by how many
  releases a major has needed — `v6.md`, `v5.2.md`, `v4.3.md`, `v4.2.md`, `v4.md`,
  `v2.0.2.md` all exist. Copy the filename you created; do not construct it from the
  version. `docusaurus.config.js` sets `onBrokenMarkdownLinks: "throw"`, so a link to a
  page that does not exist fails the build.
- `docs/sidebars-operate.js` — add `"operators/reference/changelog/<page>"` (the same
  filename, without `.md`) to the changelog list. The sidebar enumerates these pages
  explicitly; an unlisted page is published but has no nav entry.

### 2. Analyze Branch Changes

Run `git diff origin/main...HEAD --stat` for overview, then `git diff origin/main...HEAD` for details.
(`next` was the aztec-packages branch and does not exist here — after the migration the
command aborted with `fatal: ambiguous argument 'next...HEAD'` instead of producing a diff.)

**Categorize changes:**

- Breaking changes (API modifications, removals, renames)
- New features (APIs, CLI flags, configuration)
- Deprecations
- Configuration changes (CLI flags, environment variables)

### 3. Generate Draft Entries

Present draft entries for review BEFORE editing files. Match the formatting conventions by reading existing entries in each file.

### 4. Edit Documentation

After approval, add entries to the appropriate files.

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
