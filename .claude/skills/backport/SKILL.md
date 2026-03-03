---
name: backport
description: Backport a merged PR to a release branch, resolving conflicts if needed
argument-hint: <PR number> <target branch>
---

# Backport PR

Backport a merged PR to its release branch train. The automated workflow
cherry-picks onto `merge-train/<target>` and commits conflict markers
with a `CONFLICTS:` prefix. This skill is typically invoked by ClaudeBox to
resolve those conflicts, or manually to trigger/redo a backport.

## Usage

```
/backport 12345 v4              # release branch
/backport 12345 v4-devnet-2     # devnet branch
```

## Workflow

### Step 1: Validate Arguments

Confirm exactly two arguments are provided: a PR number and a target branch.

Supported target branches:
- Release branches: `v2`, `v3`, `v4`
- Devnet branches: `v4-devnet-1`, `v4-devnet-2`, etc.

**Abort if:**
- Missing arguments -> "Usage: /backport <PR number> <target branch>"

### Step 2: Validate PR State

```bash
gh pr view <PR> --repo AztecProtocol/aztec-packages --json state,title
```

**Abort if:**
- `state` is not `MERGED` -> "PR #<N> is <state>, only merged PRs can be backported."

### Step 3: Check if Already Backported

Check whether this PR has already been backported to the train branch:

```bash
TRAIN_BRANCH="merge-train/${TARGET_BRANCH}"
git fetch origin "$TRAIN_BRANCH" 2>/dev/null
if git log "origin/$TRAIN_BRANCH" --oneline --grep="(#<PR_NUMBER>)" | grep -q .; then
  echo "PR #<PR_NUMBER> has already been backported to $TRAIN_BRANCH."
fi
```

If it exists as a `CONFLICTS:` commit, proceed to conflict resolution (Step 6).
If it exists as a clean commit, abort — already done.

### Step 4: Create Isolated Worktree

Create a temporary worktree so the backport does not disturb the user's current
branch or working tree. Save the original directory to return to later.

```bash
ORIGINAL_DIR=$(pwd)
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR=$(mktemp -d)
git worktree add "$WORKTREE_DIR" HEAD
cd "$WORKTREE_DIR"
```

All subsequent steps run inside the worktree. On completion or failure, always
clean up (see Step 10).

### Step 5: Attempt Automated Backport

Run the backport script from the worktree:

```bash
./scripts/backport_to_staging.sh <PR_NUMBER> <TARGET_BRANCH>
```

**If the script succeeds (no conflicts):** Skip to Step 10 (cleanup and report).

**If the script produces a `CONFLICTS:` commit:** Continue to Step 6.

### Step 6: Assess Conflicts

The script has already committed the conflict markers onto the train branch as a
`CONFLICTS: <title> (#<PR>)` commit. Check out the train branch and inspect:

```bash
TRAIN_BRANCH="merge-train/${TARGET_BRANCH}"
git fetch origin "$TRAIN_BRANCH"
git checkout -B "$TRAIN_BRANCH" "origin/$TRAIN_BRANCH"
```

Identify conflicted files:
```bash
git diff HEAD~1 HEAD --name-only
grep -rn "<<<<<<" . --include="*.ts" --include="*.nr" --include="*.cpp" \
  --include="*.hpp" --include="*.rs" --include="*.sol" -l 2>/dev/null \
  | grep -v node_modules | grep -v .git
```

Get the full PR diff for reference:
```bash
gh pr diff <PR_NUMBER>
```

### Step 7: Resolve Conflicts

For each file with conflict markers:

1. **Read the file** to understand what conflicted
2. **Read the PR diff** to understand the intent of the change
3. **Resolve the markers** by editing the file, adapting the change to the
   current state of the code on the release branch
4. The release branch may have diverged significantly from `next` — preserve
   semantic intent, not exact line-by-line diff

**Important considerations:**
- If a file referenced in the diff does not exist on the release branch, evaluate
  whether it should be created or if the change is irrelevant. If irrelevant,
  skip it and note in the final report.

### Step 8: Verify Build

Check if changes exist in `yarn-project`:
```bash
git diff HEAD~1 --name-only | grep '^yarn-project/' || true
```

If yarn-project changes exist, run from `yarn-project`:
```bash
yarn build
```

If changes exist outside yarn-project, run bootstrap from the repo root:
```bash
BOOTSTRAP_TO=yarn-project ./bootstrap.sh
```

Fix any build errors that arise from the backport adaptation.

### Step 9: Amend the Conflicts Commit

Replace the `CONFLICTS:` commit with a clean one (drop the `CONFLICTS:` prefix):

```bash
git add -A
git commit --amend --no-edit -m "<original title> (#<PR_NUMBER>)

<original PR body>"
git push origin "$TRAIN_BRANCH" --force-with-lease
```

### Step 10: Cleanup and Report

Return to the original directory and remove the temporary worktree:

```bash
cd "$ORIGINAL_DIR"
git worktree remove "$WORKTREE_DIR"
```

**Always clean up the worktree**, even if earlier steps failed.

Print a summary:
- PR number and title that was backported
- Target branch and train branch name
- Whether conflicts were encountered and resolved
- Link to the train PR (if one exists)

## Key Points

- **Train branch convention**: `merge-train/<target>`
  (e.g. `merge-train/v4`). Multiple backports accumulate here.
- **Conflicts are pre-committed**: The script commits conflict markers with a
  `CONFLICTS:` prefix rather than failing. Resolve and amend that commit.
- **Always use a worktree**: All backport work happens in a temporary git worktree
  so the user's current branch and working tree are never disturbed.
- **Script first, manual second**: Always try the automated script first. Only
  resolve conflicts manually if it produced a `CONFLICTS:` commit.
- **Preserve author attribution**: The script sets `--author` to the original PR
  author. Preserve this when amending.
- **Verify builds but skip tests**: Run `yarn build` or bootstrap to confirm the
  backport compiles. Do not run the full test suite — that is CI's job.
- **Semantic, not mechanical**: When resolving conflicts, adapt the change to the
  release branch's code state. The goal is the same behavioral change, not an
  exact diff match.
