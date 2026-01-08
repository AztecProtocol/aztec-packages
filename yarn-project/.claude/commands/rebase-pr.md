---
description: Rebase a PR on its base branch, fix conflicts, and verify build
argument-hint: <PR number>
allowed-tools: Bash(gh:*), Bash(git fetch:*), Bash(git rebase:*)
---

# Rebase PR

Rebase PR $ARGUMENTS on top of its base branch, fix any conflicts, and verify it builds.

## Phase 1: Checkout & Get PR Info

### Step 1: Get PR info
```bash
gh pr view $ARGUMENTS --repo AztecProtocol/aztec-packages --json headRefName,baseRefName
```

Note the `baseRefName` (usually `master` or `next`).

### Step 2: Checkout the PR branch
```bash
gh pr checkout $ARGUMENTS
```

---

## Phase 2: Rebase on Base Branch

### Step 1: Fetch the latest base branch
```bash
git fetch origin $BASE_BRANCH
```

### Step 2: Rebase
```bash
git rebase origin/$BASE_BRANCH
```

### Step 3: Handle conflicts (if any)
If there are conflicts:
1. For each conflicting file, analyze the conflict and resolve it
2. Stage the resolved files: `git add <file>`
3. Continue the rebase: `git rebase --continue`
4. Repeat until rebase completes

**IMPORTANT**: Always REBASE, never merge.

---

## Phase 3: Bootstrap (Only If Needed)

See CLAUDE.md "When to Run Bootstrap". Check if changes outside `yarn-project`:
```bash
git diff --name-only HEAD@{1}..HEAD | grep -v "^yarn-project/"
```

---

## Phase 4: Verify & Push

1. Run quality checklist (see CLAUDE.md "Before Committing") - fix any errors
2. Amend and push (see CLAUDE.md "Fixing PRs")

---

## Reference

- See `CLAUDE.md` for project conventions
