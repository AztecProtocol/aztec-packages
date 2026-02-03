---
name: rebase-pr
description: Rebase a PR on its base branch, fix conflicts, and verify build
argument-hint: <PR number>
---

# Rebase PR

Simple workflow to rebase a PR on its base branch, resolve conflicts, and push.

## Usage

```
/rebase-pr 19882
```

## Workflow

### Step 1: Get PR Info

```bash
gh pr view <PR> --repo AztecProtocol/aztec-packages --json headRefName,baseRefName
```

Note the `baseRefName` (usually `next` or `master`).

### Step 2: Checkout PR

```bash
gh pr checkout <PR>
```

### Step 3: Rebase on Base Branch

```bash
git fetch origin <base-branch>
git rebase origin/<base-branch>
```

### Step 4: Resolve Conflicts (if any)

If there are conflicts:

1. **Identify conflicting files**:
   ```bash
   git status
   ```

2. **Resolve each conflict**: Edit the files to resolve conflicts

3. **Stage resolved files**:
   ```bash
   git add <resolved-file>
   ```

4. **Continue rebase**:
   ```bash
   git rebase --continue
   ```

5. **Repeat** until rebase completes

**Important**: Always REBASE, never merge.

### Step 5: Bootstrap (if needed)

Check if changes exist outside `yarn-project`:
```bash
git diff origin/<base-branch>...HEAD --name-only | grep -v '^yarn-project/'
```

If yes, run bootstrap from repo root:
```bash
(cd $(git rev-parse --show-toplevel) && BOOTSTRAP_TO=yarn-project ./bootstrap.sh)
```

### Step 6: Verify Build

Run from `yarn-project`:

```bash
yarn build
```

If there are build errors from the rebase, fix them.

### Step 7: Quality Checklist

Format and lint ALL packages:

```bash
yarn format
yarn lint 
```

### Step 8: Amend and Push

```bash
git add .
git commit --amend --no-edit
git push --force-with-lease
```

## Key Points

- **Rebase, don't merge**: Always use `git rebase`, never `git merge`
- **Amend, don't create new commits**: PRs should be single commits
- **Bootstrap when needed**: Only if there are changes outside yarn-project
- **Verify build**: Always run `yarn build` after rebase
- **Force push with lease**: Use `--force-with-lease` for safety
