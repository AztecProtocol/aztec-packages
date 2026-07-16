# ClaudeBox Backport

Instructions for ClaudeBox when automatically backporting a merged PR to a release
branch staging area. This is triggered by `backport.yml` when a cherry-pick fails.

## Context

You will receive a prompt like:
> Backport PR #NNN (title) to BRANCH. The automatic cherry-pick failed due to conflicts.

Variables you need to extract from the prompt:
- `PR_NUMBER`: the PR number (e.g., `21829`)
- `TARGET_BRANCH`: the target branch (e.g., `v4-next`, or `next` for a `port-to-next` port)
- `STAGING_BRANCH`: `backport-to-${TARGET_BRANCH}-staging` for a backport. For a
  `port-to-next` port it is `port-to-next-staging`; the prompt states it explicitly
  (`... (staging branch port-to-next-staging) ...`) — use the branch named there.

## Constraints

You are running inside ClaudeBox. You do **not** have `gh` CLI or `git push`.
Use MCP tools instead: `github_api`, `git_fetch`, `create_pr`, `update_pr`.

`create_pr` pushes from the current HEAD. If HEAD is on the wrong branch, unrelated
commits will leak into the PR. **Always verify your branch before calling `create_pr`.**

## Workflow

### 1. Validate PR State

```
github_api(method="GET", path="repos/AztecProtocol/aztec-packages/pulls/<PR_NUMBER>")
```

Confirm `state` is `closed` and `merged` is `true`. Extract `merge_commit_sha`.
Abort if the PR is not merged.

### 2. Check if Already Backported

```bash
git_fetch(args="origin ${STAGING_BRANCH}")
git log "origin/${STAGING_BRANCH}" --oneline --grep="(#<PR_NUMBER>)" | head -5
```

Abort if the PR number appears in the staging branch commit log.

### 3. Check Out the Staging Branch

**CRITICAL: Always branch from the staging branch, never the target branch.**

```bash
git_fetch(args="origin ${STAGING_BRANCH}")
git_fetch(args="origin ${TARGET_BRANCH}")

# Check out the staging branch as your base
# If it doesn't exist yet, create from target branch
git checkout -B "${STAGING_BRANCH}" "origin/${STAGING_BRANCH}" 2>/dev/null \
  || git checkout -B "${STAGING_BRANCH}" "origin/${TARGET_BRANCH}"
```

### 4. Cherry-Pick the Merge Commit

```bash
git_fetch(args="origin <MERGE_COMMIT_SHA>")

# Detect if merge commit (multiple parents → use -m 1)
PARENT_COUNT=$(git rev-list --parents -n 1 <MERGE_COMMIT_SHA> | wc -w)
if [ $PARENT_COUNT -gt 2 ]; then
  git cherry-pick -m 1 <MERGE_COMMIT_SHA> --no-edit
else
  git cherry-pick <MERGE_COMMIT_SHA> --no-edit
fi
```

If cherry-pick succeeds cleanly: skip to Step 7.
If cherry-pick fails with conflicts: continue to Step 5.

### 5. Resolve Conflicts

When the cherry-pick fails:

1. Check `git status` and `git diff` to understand the conflict state
2. Get the full PR diff for reference:
   ```
   github_api(method="GET", path="repos/AztecProtocol/aztec-packages/pulls/<PR_NUMBER>",
              accept="application/vnd.github.v3.diff")
   ```
3. For each conflicted file:
   - Read the file to see conflict markers
   - Understand the intent from the PR diff
   - Resolve by adapting the change to the release branch's code state
   - The goal is the same behavioral change, not an exact diff match
4. After resolving all conflicts:
   ```bash
   git add -A
   git commit --no-edit  # uses the cherry-pick message
   ```
   If the cherry-pick was aborted, commit manually:
   ```bash
   git commit -m "cherry-pick: <MERGE_COMMIT_SHA> <PR_TITLE> (with conflicts)"
   ```

### 6. Verify Build (if practical)

If changes are in `yarn-project/`:
```bash
cd yarn-project && yarn build
```

Fix any build errors from the adaptation. Commit fixes separately:
```bash
git commit -am "fix: resolve cherry-pick conflicts"
```

### 7. Create the PR

**Before calling `create_pr`, verify you are on the staging branch:**
```bash
git log --oneline -3
# Should show your cherry-pick commit(s) on top of staging branch history
# Should NOT show unrelated commits from the target branch
```

Then create the PR:
```
create_pr(
  title="<PR_TITLE> (backport #<PR_NUMBER>)",
  body="## Summary
Backport of https://github.com/AztecProtocol/aztec-packages/pull/<PR_NUMBER> to <TARGET_BRANCH>.

<Brief description of what was backported and any conflicts resolved>

## Commit structure
1. Cherry-pick with conflict markers (if conflicts existed)
2. Conflict resolution (if needed)",
  base="backport-to-<TARGET_BRANCH>-staging"
)
```

### 8. Report

Use `respond_to_user` with a short summary including:
- Link to the created PR
- Whether conflicts were encountered and how they were resolved
