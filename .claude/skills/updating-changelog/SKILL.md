---
name: updating-changelog
description: Updates changelog documentation for contract developers and node operators from aztec-node's own operator changelog, its GitHub release notes and the branch changes relative to 'next'. Use when preparing a PR, updating migration notes, documenting breaking changes, or when asked to update changelog/release notes.
---

# Updating Changelog

The docs live in this repository's `docs/`, in two lines that each have their own copy of
every developer and operator page (`docs/CLAUDE.md`, "Two dev lines: change both"). The code
they describe is mostly aztec-node's: main's pages follow aztec-node `main` at the commit
`docs/aztec-node.json` pins, and the v6 line's (`docs/lines/v6/`) follow aztec-node `v6` at the
commit `docs/lines/v6/aztec-node.json` pins. Each is read through its line's checkout, which
`node docs/scripts/aztec_node.mts fetch` keeps (main's is `$AZTEC_NODE_DIR`, default
`docs/.aztec-node/tree`; v6's is `docs/lines/v6/.aztec-node/tree`); versions and changes are
read there, never in the `labs/` submodule. This repository's own code (`l1-contracts/`,
`barretenberg/`, …) is the rest.

aztec-node records operator-facing changes as they land, in `CHANGELOG-OPERATORS.md` at its
root. It keeps one copy per release line, on that line's branch, so the checkout holds the copy
for the line the pin names. Those entries are the operator changelog's source: this skill moves
them here and re-heads them under the release, rather than reconstructing them from the diff.
The diff is still read, as the check on what the file missed.

## Steps

### 1. Determine Target Files

The version is the Labs release the line's pin names, read from its checkout. For main
(for the v6 line, `lineopt="--line v6"`):

```bash
cd "$(git rev-parse --show-toplevel)"
lineopt=
node docs/scripts/aztec_node.mts $lineopt fetch && pin=$(node docs/scripts/aztec_node.mts $lineopt env) || exit 1
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
since a pin can lag it: `baseRefName` `main` is the major `main` carries (v7 from
2026-11-04), `v6` is v6.

**Which lines get the entry.** A v6.x entry goes into both lines, since v7 readers upgrade
from the latest v6. A v7 entry goes into main only. Released entries are history in either
line: never edit them.

**Target files**, in each line that gets the entry (main's paths below; the v6 line's are the
same under `docs/lines/v6/`):

- Aztec contract developers: `docs/docs-developers/docs/resources/migration_notes.md`
- Node operators and Ethereum contract developers: `docs/docs-operate/operators/reference/changelog/v{major}.md`

When that file is new (the first entry of a major), two more files of the same line must
be updated or the page ships unreachable:

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

**Routing the Labs release notes** (source 4 below, and the release skills). Route each entry
by the section it sits in, into the target files above:

| Section of the notes | Goes to |
| --- | --- |
| `Breaking changes`: **Aztec.nr**, **Aztec.js**, **Node API**, **CLI** (wallet and dev commands), **Protocol** | migration notes |
| `For wallet / PXE developers` | migration notes, when a project on the previous version must change something |
| `Breaking changes for node operators`, `When to switch on Mainnet`, **Node operators** under `Breaking changes`, `For node operators` (**Publishers and L1**, **BLS keys and staking**, **Provers**, **Operations**) | operator changelog |
| **Where things live** | by the entry's tag: `[npm]` and `[Aztec.nr]` to the migration notes, `[Docker]` to the operator changelog |
| `Security & correctness` | operator changelog, only when an operator must act |
| `New in this release` | operator changelog (its new-features shape) when operators see it; never the migration notes |
| `Protocol constants` | neither: `/release-docs` Step 9 checks them against the chain |
| `Summary`, `Reference` | neither |

These are v6.0.0's headings. Route a section the table does not name by who must act on each
entry, and ask when that is unclear. The migration notes take what a project on the previous
version must change, plus deprecations that still work; pure new features stay out. The
operator changelog takes breaking changes, new features and changed defaults.

### 2. Analyze Branch Changes

The base is `origin/next` (`git fetch origin next` first). Four sources, each read where it
lives:

1. **This repository's own changes** (Foundation code, and the docs already written; the
   `labs` gitlink is the Foundation's build input, not the docs' pin):

   ```bash
   cd "$(git rev-parse --show-toplevel)"
   git diff origin/next...HEAD --stat -- . ':!labs'
   git diff origin/next...HEAD -- . ':!labs'
   ```

2. **Labs code, when this branch moves a line's pin** (`docs/aztec-node.json` or
   `docs/lines/<line>/aztec-node.json`, moved with `node docs/scripts/aztec_node.mts [--line
   <line>] pin <tag>`). Read the range in that line's checkout; both commits must be in it,
   and a two-commit diff needs no history between them. For main:

   ```bash
   cd "$(git rev-parse --show-toplevel)"
   pinfile=docs/aztec-node.json lineopt=   # the v6 line's: pinfile=docs/lines/v6/aztec-node.json lineopt="--line v6"
   old=$(git show "$(git merge-base origin/next HEAD):$pinfile" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).commit')
   new=$(node -p "require('./$pinfile').commit")
   node docs/scripts/aztec_node.mts $lineopt fetch && pin=$(node docs/scripts/aztec_node.mts $lineopt env) || exit 1
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

4. **The Labs release notes**, when this branch moves a line's pin to a release or rc tag of
   v6.1.0 or later (`v6.1.0-rc.1` counts). They index what changed; `docs/CLAUDE.md` ("Labs
   release notes") says how to treat them. The range starts at the newest released version in
   the line's migration notes, not at the old pin, which can be a nightly. For main:

   ```bash
   cd "$(git rev-parse --show-toplevel)"
   pinfile=docs/aztec-node.json notes=docs/docs-developers/docs/resources/migration_notes.md   # the v6 line's: under docs/lines/v6/
   to=$(node -p "require('./$pinfile').ref") core=${to#v} core=${core%%-*}
   [[ $to =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ ]] && [ "$(printf '%s\n' 6.1.0 "$core" | sort -V | head -n1)" = 6.1.0 ] \
     || { echo "$to: no release notes to read"; exit 0; }
   from=v$(grep -m1 -oE '^## [0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' "$notes" | cut -c4-)
   out=$(mktemp -d) && node docs/scripts/labs_release_notes.mts "$from" "$to" "$out"
   ```

   It exits 2 when `$from` is not below `$to`: the line already released that version, and
   there is nothing new to read. `$out/index.tsv` lists each release and rc tag in the range
   that `$to` contains, with its status: `ok` (the notes are in `$out/<tag>.md`), `empty` or
   `missing`. An intermediate tag without notes is normal. When `$to` has none, its notes may
   still come: say so, and carry on from sources 2 and 3. Step 3 says how to draft from them.

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

**From the Labs release notes** (source 4), route each entry with the table in Step 1, and:

- **Dedupe first.** The key is the PR the entry names, as `<repo>#<N>`
  (`aztec-labs-eng/aztec-node#511`), or else its new symbol. Search the target file from
  `## TBD` down to the previous release of the line: a release's notes can span its whole
  range (v6.0.0's start at v5.2.0), so they repeat entries already filed under an rc heading.
  An entry already under `## TBD` is filed; do not draft it again. Never edit a released entry.
- **Operator entries**: an entry that `CHANGELOG-OPERATORS.md` also has keeps that file's
  wording. The notes fill what the file lacks, and check it.
- **Developer entries**: draft from the notes, then confirm each one in the code at the tag
  (`$AZTEC_NODE_DIR`). The code wins; report a contradiction with both readings.
- **Breaking or not**: cross-check the notes against the `!:` commits of source 2, and report
  a disagreement instead of picking one.
- **Coverage table**, presented with the drafts, one row per breaking entry of the notes:
  `entry (tag · section · PR) | goes to (file · heading), or dismissed because | confirmed at the tag by`.
  - An entry is breaking when its heading contains `Breaking` (`Breaking changes`,
    `Breaking changes for node operators`). Once Labs marks entries one by one, the marker
    decides instead.
  - Every row ends in a file or a reason: already filed under an earlier heading, contradicted
    by the code at the tag, or not in this line.
  - The last column names the evidence: a path in the checkout, a `CHANGELOG-OPERATORS.md`
    entry or a commit.
  - Without notes (`missing` or `empty`) the table is empty, and sources 2 and 3 stand as before.

### 4. Edit Documentation

After approval, add entries to the appropriate files of each line that gets them, in this
repository's `docs/` (never in a checkout or under `labs/`, and never a versioned snapshot).

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

**Citing the PR.** When the Labs release notes name the entry's PR, end the explanation with
it: `([aztec-node#511](https://github.com/aztec-labs-eng/aztec-node/pull/511))`, or
`([aztec-packages#N](https://github.com/AztecProtocol/aztec-packages/pull/N))` for work ported
from this repository. Write the URL from the repository and the number; never copy the link
from the notes, and cite no other repository. Cite only once the change is proven in the tag
(`/release-docs` Step 8 item 1: the commit's ancestry, a backport's, or the new syntax at the
tag). A ported PR's merge commit is never in aztec-node's history: prove it by the port commit
or by the syntax.

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
