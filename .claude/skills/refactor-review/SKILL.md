---
name: refactor-review
description: Deep review of a refactor branch to catch unexpected behavioral changes, regressions, or missing functionality. Merges latest parent, resolves conflicts, then inspects the full diff.
---

# Refactor Review

Deep inspection of a refactor branch to verify behavioral equivalence with the parent branch.

## Purpose

A refactor should change implementation without changing behavior. This review catches:

- Unexpected behavioral changes (different defaults, removed features, changed error handling)
- Regressions (tests weakened, timeouts extended, coverage removed)
- Incomplete work (TODOs, FIXMEs, commented-out code, stub implementations)
- Missing functionality (features on parent that aren't present on the branch)

## Workflow

### Step 1: Merge latest parent

```bash
# Determine the base branch
BASE=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null || echo "next")
git fetch origin "$BASE"
git merge "origin/$BASE"
```

If there are conflicts, resolve them and commit the merge. If conflicts are non-trivial, report them to the user before proceeding.

### Step 2: Build

```bash
./bootstrap.sh
```

Fix any build errors introduced by the merge. If build errors exist pre-merge (on the branch itself), note them but don't block the review.

### Step 3: Determine refactor intent

If the user provided a description of the refactor's purpose, use that. Otherwise, examine:

- PR title and description (`gh pr view`)
- Commit messages (`git log origin/$BASE..HEAD --oneline`)
- The diff itself (`git diff origin/$BASE...HEAD --stat`)

Summarize the intent in one sentence before proceeding.

### Step 4: Deep diff inspection

Run `git diff origin/$BASE...HEAD` and analyze every change for:

#### Behavioral changes

- Default values changed (timeouts, pool sizes, config defaults)
- Error handling changed (catch blocks added/removed, error types changed)
- Control flow changed (early returns added, conditions inverted)
- API signatures changed (parameters added/removed/reordered)
- Feature flags or env vars added/removed/renamed

#### Regressions

- Test assertions weakened or removed
- Test timeouts increased — always flag as MEDIUM with old/new values. Timeout increases can mask performance regressions; each must be justified or investigated.
- Test cases removed or commented out
- Error paths that now silently succeed
- Functionality that existed on parent but is missing on the branch
- Loss of parallelization or concurrency.

#### Incomplete work

- TODO/FIXME/HACK comments added
- Stub implementations (`throw new Error('not implemented')`)
- Commented-out code
- Dead code paths (unreachable branches)

#### Resource management

- Cleanup/dispose calls removed
- New resources without corresponding cleanup
- Changed lifecycle (e.g., process vs thread, persistent vs per-call)

### Step 5: Generate report

Produce a structured report:

```
## Refactor Review: <branch-name>

**Intent:** <one-sentence summary>
**Base:** <parent branch>
**Files changed:** <count>

### Behavioral Changes
- [file:line] Description of change and impact

### Regressions
- [file:line] Description of what was lost

### Incomplete Work
- [file:line] TODO/stub/commented-out code

### Resource Management
- [file:line] Cleanup concern

### Summary
<overall assessment: is this behaviorally equivalent?>
```

### Step 6: Wait for user

Present the report and wait for the user to tell you what to fix. Do NOT make changes autonomously — the user decides which findings are intentional and which need fixing.
