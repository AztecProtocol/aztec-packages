---
name: backport
description: Backport a merged PR to a release branch, resolving conflicts if needed
argument-hint: <PR number> <target branch>
---

# Backport PR

Backport a merged PR to a release branch staging area. Uses the existing
`scripts/backport_to_staging.sh` for the happy path, then resolves conflicts
manually if the diff does not apply cleanly.

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

Check whether this PR has already been backported to the staging branch by
looking for its PR number in the commit log:

```bash
STAGING_BRANCH="backport-to-${TARGET_BRANCH}-staging"
git fetch origin "$STAGING_BRANCH" 2>/dev/null
if git log "origin/$STAGING_BRANCH" --oneline --grep="(#<PR_NUMBER>)" | grep -q .; then
  echo "PR #<PR_NUMBER> has already been backported to $STAGING_BRANCH."
fi
```

**Abort if** the PR number appears in the staging branch commit log. Show the
matching commit(s) and tell the user the backport already exists.

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

**If the script succeeds:** Skip to Step 10 (cleanup and report).

**If the script fails:** Continue to Step 6 (conflict resolution).

### Step 6: Assess Conflicts

The script will have left the worktree on the `backport-to-<TARGET_BRANCH>-staging`
branch with partially applied changes and `.rej` files for hunks that failed.

1. **Verify current branch** is `backport-to-<TARGET_BRANCH>-staging`

2. **Identify the state of the working tree:**
   ```bash
   git status
   ```

3. **Find all reject files:**
   ```bash
   find . -name '*.rej' -not -path './node_modules/*' -not -path './.git/*'
   ```

4. **Get the full PR diff for reference:**
   ```bash
   gh pr diff <PR_NUMBER>
   ```

### Step 7: Resolve Conflicts

For each `.rej` file:

1. **Read the reject file** to understand what hunk failed to apply
2. **Read the current version** of the corresponding source file on the staging branch
3. **Understand the intent** of the change from the PR diff context
4. **Apply the change manually** by editing the source file, adapting the change to
   the current state of the code on the release branch
5. **Delete the `.rej` file** after resolving

Also check for files that may need to be created or deleted based on the PR diff
but were not handled by the partial apply.

**Important considerations:**
- The release branch may have diverged significantly from `next`. Do not assume
  the surrounding code is the same as in the original PR.
- When adapting changes, preserve the semantic intent of the PR, not the exact
  line-by-line diff.
- If a file referenced in the diff does not exist at all on the release branch,
  evaluate whether it should be created or if the change is irrelevant. If
  irrelevant, skip it and note this in the final report.

### Step 8: Verify Build

Check if changes exist in `yarn-project`:
```bash
git diff --name-only | grep '^yarn-project/' || true
```

If yarn-project changes exist, run from `yarn-project`:
```bash
yarn build
```

Check if changes exist outside `yarn-project`:
```bash
git diff --name-only | grep -v '^yarn-project/' || true
```

If changes exist outside yarn-project, run bootstrap from the repo root:
```bash
./bootstrap.sh build yarn-project
```

Fix any build errors that arise from the backport adaptation.

### Step 9: Finish with Script

Clean up and let the script handle commit, push, and PR management:

```bash
find . -name '*.rej' -delete
git add -A
./scripts/backport_to_staging.sh --continue <PR_NUMBER> <TARGET_BRANCH>
```

### Step 10: Cleanup and Report

Return to the original directory and remove the temporary worktree:

```bash
cd "$ORIGINAL_DIR"
git worktree remove "$WORKTREE_DIR"
```

**Always clean up the worktree**, even if earlier steps failed. If `git worktree
remove` fails (e.g., uncommitted changes), use `git worktree remove --force`.

Print a summary:
- PR number and title that was backported
- Target branch and staging branch name
- Whether conflicts were encountered and resolved
- Link to the staging PR (if one was created or already exists)

## Key Points

- **Always use a worktree**: All backport work happens in a temporary git worktree
  so the user's current branch and working tree are never disturbed. Always clean
  up the worktree when done, even on failure.
- **Script first, manual second**: Always try the automated script first. It handles
  branch setup, authorship, push, and PR management. Only do manual conflict
  resolution if it fails.
- **Use `--continue` after resolving**: The script's `--continue` mode picks up where
  the initial run left off (commit, push, PR creation, body update).
- **Preserve author attribution**: The script uses `--author` to set the original PR
  author on the commit. The committer stays as whoever runs the command (GPG signing
  works).
- **Verify builds but skip tests**: Run `yarn build` or bootstrap to confirm the
  backport compiles. Do not run the full test suite -- that is CI's job.
- **Semantic, not mechanical**: When resolving conflicts, adapt the change to the
  release branch's code state. The goal is the same behavioral change, not an exact
  diff match.
- **Clean up `.rej` files**: Always delete `.rej` files before committing.
- **Staging branch convention**: The staging branch is always
  `backport-to-{TARGET_BRANCH}-staging` (e.g., `backport-to-v4-staging`,
  `backport-to-v4-devnet-2-staging`). Multiple backports accumulate on the same
  staging branch and get merged together.
