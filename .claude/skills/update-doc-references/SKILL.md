---
name: update-doc-references
description: Analyze source-file changes referenced by documentation, update affected docs when needed, and report documentation reference updates for a PR.
---

# Update Documentation References

When source files referenced by documentation change, analyze the changes and update the
affected documentation if needed.

The docs live in this repository's `docs/`, in two lines that each have their own copy of
every developer and operator page (`docs/CLAUDE.md`, "Two dev lines: change both"). Most of
the code they document is aztec-node's: main's pages describe aztec-node `main` at the commit
`docs/aztec-node.json` pins, read through a checkout of it (`docs/.aztec-node/tree`, or
`$AZTEC_NODE_DIR`), and the v6 line's pages (`docs/lines/v6/`) describe aztec-node `v6` at
the commit `docs/lines/v6/aztec-node.json` pins, read through `docs/lines/v6/.aztec-node/tree`.
`node docs/scripts/aztec_node.mts fetch` keeps both. A page's frontmatter `references` names
paths from this repository's root: `labs/<path in aztec-node>` for Labs code, where the
`labs/` prefix names the checkout of the page's line and never the `labs/` submodule, and
plain paths for this repository's own files (`docs/examples/...`, `docs/lines/v6/examples/...`).
A reference ending in `/*` covers every file under that directory.

## Workflow

### Step 1: Parse the Prompt

The dispatcher is offline, so the skill runs by hand: it needs only the PR number and its
repository, and Step 3 finds the pages the PR's files reach. A dispatch prompt gives:

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

Each line's pages describe the code at that line's pin. The PR's base branch
(`baseRefName`: `main` or `v6`) says which line to start with, not which lines it reaches:
test its merge commit against every pin (an unmerged PR is in none):

```bash
cd "$(git rev-parse --show-toplevel)"
merge=$(gh pr view <PR_NUMBER> --repo aztec-labs-eng/aztec-node --json mergeCommit -q .mergeCommit.oid)
for pinfile in docs/aztec-node.json docs/lines/*/aztec-node.json; do
  echo "$pinfile: $(gh api "repos/aztec-labs-eng/aztec-node/compare/$merge...$(node -p "require('./$pinfile').commit")" --jq .status)"
done
```

`ahead` or `identical` means that line's pin has the change, so its pages may need it. A line
whose pin lacks it gets no edit that quotes the new code: report what its pages will need
when its pin moves. Then compare the symbol or behaviour the pages document in both
checkouts, and edit each copy whose checkout has it (Step 5): a `main` PR can fix behaviour v6
shares, and a page that is wrong about code both lines have is wrong in both copies.

When the change is a move of a pin rather than a PR (`node docs/scripts/aztec_node.mts
[--line <line>] pin <tag>`), the pages it reaches come from the line's two pin commits. Run
this once per line whose pin moved, after `check` passes:

```bash
cd "$(git rev-parse --show-toplevel)"
docs/scripts/pin_doc_references.sh   # the v6 line's: docs/scripts/pin_doc_references.sh --line v6
```

It prints `<reference> -> <page>, <page>` for each `labs/` reference whose files differ
between the line's pin at `git merge-base origin/next HEAD` and its pin now. Pass the old
commit as an argument when the base is another (a release cut does). That list is Step 3's
mapping. stderr names both commits and the checkout, so read one reference's change with:

```bash
git -C "$AZTEC_NODE_DIR" diff <old> <new> -- <reference without labs/ and /*>
```

`AZTEC_NODE_DIR` is the line's checkout: `eval "$(node docs/scripts/aztec_node.mts [--line
v6] env)"` exports it. The pin file also names the toolchain: when `bb`, `noir` or `l1Artifacts` moved, say so in
the report, since the examples and the Solidity snippets follow them.

### Step 3: Identify Affected Documentation

The prompt lists which source files changed and which docs reference them. Confirm the
mapping from the docs' frontmatter, from the repository root, once per line (the library
scans a line's `docs-developers`, `docs-operate`, `docs-participate` and `docs`, never the
versioned snapshots):

```bash
cd "$(git rev-parse --show-toplevel)"
source docs/scripts/lib/extract_doc_references.sh
map=$(mktemp) changed=$(mktemp)
gh pr view <PR_NUMBER> --repo aztec-labs-eng/aztec-node --json files -q '.files[].path' |
  sed 's|^|labs/|' >"$changed"
for root in docs docs/lines/*; do
  extract_references_mapping "$root" "$map"
  changed_references "$map" "$changed"
done
```

Each line is `<reference> -> <page>, <page>`, as `pin_doc_references.sh` prints for a pin
move, which needs no other mapping. For a PR of this repository drop the `sed`. Report any
pair the prompt lists that this does not produce, and the reverse: the dispatcher's mapping
is then stale.

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

If documentation updates are needed, edit this repository's source docs (`docs/docs-*`,
`docs/docs/` and each line's `docs/lines/<line>/docs-*`, per Step 2), never a versioned
snapshot, a checkout or `labs/`:

1. Make precise, minimal changes with the Edit tool.
2. Only modify content directly affected by the code changes.
3. Preserve the existing documentation style and tone.
4. Do not make cosmetic changes unrelated to the code changes.
5. Do not add or remove sections unless required by the code change.
6. Update code examples if the API changed; a path in `#include_code` or `references` keeps
   its `labs/` prefix, and a v6 page's paths into its examples keep `docs/lines/v6/`. Each
   line's examples build with its pin's published toolchain, so after a pin move run
   `docs/examples/bootstrap.sh` (main) or `docs/examples/bootstrap.sh --line v6` to compile and
   type-check them at the new pin.
7. Correct explanations if behavior changed.

Then run `docs/scripts/check_doc_references.sh` and, for the v6 line,
`docs/scripts/check_doc_references.sh docs/lines/v6`, which check `labs/` references in each
line's checkout (run `node docs/scripts/aztec_node.mts fetch` first; each must print `All
referenced paths exist.`), and, from `docs/`, `yarn preprocess && yarn spellcheck` (a v6
page is spellchecked through its preprocessed copy). An aztec-node PR newer
than the pin is not in the checkout yet, so an edit that quotes its code (a new
`#include_code` marker, a moved file in `references`) fails until the pin includes it:
make such edits together with the pin move, or report them, rather than editing them to
pass.

### Step 6: Commit on a Branch

For a pin move, commit the edits on the branch that moves the pin, so they ship in its PR,
naming each file as below; skip the new branch and Step 7, and list the pages you checked in
that PR's description.

Otherwise, if changes were made, commit them on a branch from `next`:

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
