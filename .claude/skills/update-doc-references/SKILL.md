---
name: update-doc-references
description: Analyze source-file changes referenced by documentation, update affected docs when needed, and report documentation reference updates for a PR.
---

# Update Documentation References

When source files referenced by documentation change, analyze the changes and update the
affected documentation if needed.

The docs live in this repository's `docs/`. Most of the code they document is aztec-node's,
checked out here as `labs/`. A page's frontmatter `references` names paths from this
repository's root: `labs/<path in aztec-node>` for Labs code, plain paths for this
repository's own files (`docs/examples/...`). A reference ending in `/*` covers every file
under that directory.

## Workflow

### Step 1: Parse the Prompt

Extract from the dispatch prompt:

- the PR number and its repository: `aztec-labs-eng/aztec-node` for Labs code (the usual
  case), `AztecProtocol/aztec-packages` for this repository's own files
- the PR title
- the changed references (format: `source_file -> doc1, doc2; ...`)
- the reply thread link, if the dispatch gives one (Step 7)

### Step 2: Get the Changes

For a PR:

```bash
gh pr view <PR_NUMBER> --repo <REPO> --json title,body,baseRefName,files,url
gh pr diff <PR_NUMBER> --repo <REPO>
```

An aztec-node PR names paths from aztec-node's root: prefix them with `labs/` to compare
them with `references`.

When the change is a move of the `labs/` pin rather than a PR (for example
`labs-patches/bootstrap.sh bump`), take it from the two gitlinks. Both commits must be in
the shallow clone; a two-commit diff needs no history between them:

```bash
old=$(git rev-parse "$(git merge-base origin/next HEAD):labs")
new=$(git rev-parse HEAD:labs)
git -C labs fetch --depth 1 origin "$old" "$new"
git -C labs diff --name-only "$old" "$new" | sed 's|^|labs/|'
git -C labs diff "$old" "$new" -- <path without labs/>
```

### Step 3: Identify Affected Documentation

The prompt lists which source files changed and which docs reference them. Confirm the
mapping from the docs' frontmatter, from the repository root (the library scans
`docs/docs-developers`, `docs/docs-operate`, `docs/docs-participate` and `docs/docs`,
never the versioned snapshots):

```bash
source docs/scripts/lib/extract_doc_references.sh
map=$(mktemp) changed=$(mktemp)
extract_references_mapping docs "$map"
gh pr view <PR_NUMBER> --repo aztec-labs-eng/aztec-node --json files -q '.files[].path' |
  sed 's|^|labs/|' >"$changed"
awk -F'|' 'NR == FNR {changed[$0]; next}
  {ref = $1; dir = sub(/\/\*$/, "/", ref)
   for (f in changed) if (dir ? index(f, ref) == 1 : f == ref) print f " -> " $2}' \
  "$changed" "$map" | sort -u
```

For a PR of this repository drop the `sed`; for a pin move write Step 2's `--name-only`
list to `"$changed"` instead. Report any pair the prompt lists that this does not produce,
and the reverse: the dispatcher's mapping is then stale.

### Step 4: Analyze Changes

For each affected documentation file:

1. Read the full documentation file.
2. Read the diff of its referenced source files.
3. Determine if the code changes affect the documentation content.

Changes that typically require doc updates:

- API signature changes (function names, parameters, return types)
- renamed or moved types, structs or traits
- changed behavior described in the documentation
- code examples that no longer compile or are incorrect
- removed or added public functions or methods referenced in docs
- a referenced file that moved or was deleted (`docs/scripts/check_doc_references.sh`
  fails until the `references` entry follows it)

Changes that typically do NOT require doc updates:

- internal implementation changes that don't affect the public API
- performance optimizations with no API change
- bug fixes that don't change documented behavior
- refactoring that preserves the same interface

### Step 5: Make Updates

If documentation updates are needed, edit this repository's source docs (`docs/docs-*` and
`docs/docs/`), never a versioned snapshot and never `labs/`:

1. Make precise, minimal changes with the Edit tool.
2. Only modify content directly affected by the code changes.
3. Preserve the existing documentation style and tone.
4. Do not make cosmetic changes unrelated to the code changes.
5. Do not add or remove sections unless required by the code change.
6. Update code examples if the API changed; a path in `#include_code` or `references` keeps
   its `labs/` prefix.
7. Correct explanations if behavior changed.

Then run `docs/scripts/check_doc_references.sh` (it must print `All referenced paths
exist.`) and, from `docs/`, `yarn spellcheck`.

### Step 6: Commit on a Branch

If changes were made, commit them on a branch from `next`:

```bash
git fetch origin next
git checkout -b "docs/update-refs-pr-<PR_NUMBER>" origin/next
git add -- <each edited doc file>
git commit -m "docs: update references for aztec-node#<PR_NUMBER>" \
  -m "Documentation updates for source file changes in aztec-labs-eng/aztec-node#<PR_NUMBER>."
```

Name each file; never `git add -A` or `git add .`, and never stage `labs`. For a PR of this
repository write `#<PR_NUMBER>`.

**Owner approval required.** Pushing the branch and opening the PR wait for the owner. Once
approved:

```bash
git push -u origin "docs/update-refs-pr-<PR_NUMBER>"
gh pr create --repo AztecProtocol/aztec-packages --base next \
  --title "docs: update references for aztec-node#<PR_NUMBER>" \
  --body "## Summary
- Documentation updates for source file changes in aztec-labs-eng/aztec-node#<PR_NUMBER>
- <list of changes made>

## Test plan
- [ ] Review documentation changes for accuracy
- [ ] Verify code examples are correct"
```

### Step 7: Report

Report the result to the dispatcher: the files analyzed, and either that the documentation
is still accurate or the full `git diff` of the changes (as a code block, so devrel can
apply them by hand), the branch name, and the PR link once one exists.

**Owner approval required.** Posting the report to the Slack thread from the dispatch is the
owner's call; with approval, reply in that thread. If the PR could not be opened, say so and
lead with the diff.

## Guidelines

- Only update docs where code changes actually affect documented content.
- Keep updates minimal and focused on the code change.
- Preserve existing documentation style.
- Do not make cosmetic changes unrelated to the code changes.
- If no documentation changes are needed, report that clearly.
- When updating code examples, ensure they remain syntactically correct.
- Do not update version numbers or dates unless explicitly part of the code change.
