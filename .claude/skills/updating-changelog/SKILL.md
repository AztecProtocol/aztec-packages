---
name: updating-changelog
description: Updates changelog documentation for contract developers and node operators from aztec-node's own operator changelog and the branch changes relative to 'next'. Use when preparing a PR, updating migration notes, documenting breaking changes, or when asked to update changelog/release notes.
---

# Updating Changelog

The docs live in this repository's `docs/`. The code they describe is mostly aztec-node's,
at the commit `docs/aztec-node.json` pins, read through a checkout of it that
`node docs/scripts/aztec_node.mts fetch` keeps (`$AZTEC_NODE_DIR`, default
`docs/.aztec-node/tree`; its version and its changes are read there, never in the `labs/`
submodule), plus this repository's own code (`l1-contracts/`, `barretenberg/`, …).

aztec-node records operator-facing changes as they land, in `CHANGELOG-OPERATORS.md` at its
root. It keeps one copy per release line, on that line's branch, so the checkout holds the copy
for the line the pin names. Those entries are the operator changelog's source: this skill moves
them here and re-heads them under the release, rather than reconstructing them from the diff.
The diff is still read, as the check on what the file missed.

## Steps

### 1. Determine Target Files

The version is the Labs release the docs' pin names, read from the checkout:

```bash
cd "$(git rev-parse --show-toplevel)"
node docs/scripts/aztec_node.mts fetch && pin=$(node docs/scripts/aztec_node.mts env) || exit 1
eval "$pin"
jq -r '."."' "$AZTEC_NODE_DIR/.version-manifest.json" 2>/dev/null ||
  jq -r '."."' "$AZTEC_NODE_DIR/.release-please-manifest.json"
```

`6.0.0` → edit `v6.md`. aztec-node renamed its manifest, so read whichever name the pinned
commit carries; both live in the checkout. It keeps one branch per release line — `v6` ships
the 6.x line, `main` the next major — and the pin names a commit on one of them, so the version
this reports is the line being documented. The release-please manifest at this repository's
root versions the Foundation tree instead, whose numbers are unrelated to Labs': never take
the version from it.

Documenting one aztec-node PR (source 3 below) takes the major from the PR's line instead,
since the pin can lag it or sit on the other line: `baseRefName` `main` is the major `main` carries (v7 from
2026-11-04), `v6` is v6.

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

1. **This repository's own changes** (Foundation code, and the docs already written; the
   `labs` gitlink is the Foundation's build input, not the docs' pin):

   ```bash
   cd "$(git rev-parse --show-toplevel)"
   git diff origin/next...HEAD --stat -- . ':!labs'
   git diff origin/next...HEAD -- . ':!labs'
   ```

2. **Labs code, when this branch moves the docs' pin** (`docs/aztec-node.json`, moved with
   `node docs/scripts/aztec_node.mts pin <tag>`). Read the range in the checkout; both
   commits must be in it, and a two-commit diff needs no history between them:

   ```bash
   cd "$(git rev-parse --show-toplevel)"
   old=$(git show "$(git merge-base origin/next HEAD):docs/aztec-node.json" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).commit')
   new=$(node -p 'require("./docs/aztec-node.json").commit')
   node docs/scripts/aztec_node.mts fetch && pin=$(node docs/scripts/aztec_node.mts env) || exit 1
   eval "$pin"
   git -C "$AZTEC_NODE_DIR" fetch --depth 1 --no-tags origin "$old" "$new"
   git -C "$AZTEC_NODE_DIR" diff "$old" "$new" -- CHANGELOG-OPERATORS.md
   git -C "$AZTEC_NODE_DIR" diff --stat "$old" "$new"
   git -C "$AZTEC_NODE_DIR" diff "$old" "$new" -- yarn-project/ noir-projects/ <other paths>
   gh api "repos/aztec-labs-eng/aztec-node/compare/$old...$new" \
     --jq '.total_commits, (.commits[].commit.message | split("\n")[0])'
   gh api "repos/aztec-labs-eng/aztec-node/compare/$old...$new" \
     --jq '.commits[].commit.message | select(test("!:"))'
   ```

   The lines that diff adds to `CHANGELOG-OPERATORS.md` are the operator entries for this pin
   move, written by whoever made each change. Take them as they stand: the author knew what
   breaks. A pin whose `$old` predates the file has nothing to diff, so read the section whole
   instead:

   ```bash
   git -C "$AZTEC_NODE_DIR" show "$new:CHANGELOG-OPERATORS.md"
   ```

   Both commands come back empty for a pin either side of which predates the file; the commit
   scan is then the only source, as it was before.

   Everything below is the check on what that file missed. The entry is a convention rather
   than something CI enforces, so a PR that renamed a flag without writing one still has to be
   documented. When the diff turns up such a change, say so: the entry is missing in aztec-node
   too, and the next person to read that file will not know the change happened.

   aztec-node marks breaking changes only with the conventional-commit `!` (`feat!:`,
   `feat(txe)!:`), never a `BREAKING CHANGE:` trailer. The second command prints every
   message containing `!:`, bodies included: port commits (`chore: port … from monorepo`)
   list the breaking commits they carry only in their body. The compare API lists at most
   250 commits; when `total_commits` is larger, list the PRs merged between the two
   commits' dates instead, and keep only those the diff confirms:

   ```bash
   from=$(git -C "$AZTEC_NODE_DIR" log -1 --format=%cs "$old") to=$(git -C "$AZTEC_NODE_DIR" log -1 --format=%cs "$new")
   gh pr list --repo aztec-labs-eng/aztec-node --state merged --limit 1000 \
     --search "merged:$from..$to" --json number,title --jq '.[] | "\(.number) \(.title)"'
   ```

3. **One aztec-node PR**, when asked to document a change that has not reached the pin yet:

   ```bash
   gh pr view <PR_NUMBER> --repo aztec-labs-eng/aztec-node --json title,body,baseRefName,files,url
   gh pr diff <PR_NUMBER> --repo aztec-labs-eng/aztec-node
   ```

   When the PR touches `CHANGELOG-OPERATORS.md`, that entry is what to document, and the branch
   the PR targets names the release line it belongs to. When it changes something operators
   configure and carries no entry, the entry is missing there: say so, so it can be added before
   the pin moves and the change has to be reconstructed from the diff alone.

**Categorize changes:**

- Breaking changes (API modifications, removals, renames)
- New features (APIs, CLI flags, configuration)
- Deprecations
- Configuration changes (CLI flags, environment variables)

### 3. Generate Draft Entries

Present draft entries for review BEFORE editing files. Match the formatting conventions by
reading existing entries in each file.

An operator entry that came from `CHANGELOG-OPERATORS.md` has already been written and
reviewed. Carry the wording across and change only what the move requires: where the heading
sits in the release, and links that pointed at an unreleased version. Rewriting it to taste
drops what the author knew about the failure mode, and leaves two descriptions of one change
that no one will notice have drifted apart.

### 4. Edit Documentation

After approval, add entries to the appropriate files in this repository's `docs/` (never
in the checkout or under `labs/`, and never a versioned snapshot).

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

`CHANGELOG-OPERATORS.md` in aztec-node is written in these same shapes, so an entry taken from
it usually needs no reformatting.

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
