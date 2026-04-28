---
name: fix
description: Analyze Linear issues, validate them against the codebase, then implement fixes and create draft PRs.
argument-hint: <issue-numbers, e.g. A-690 A-691 A-692>
---

# Fix Issues

Given a list of Linear issue numbers, analyze each one against the codebase, then implement fixes and create draft PRs.

## Phase 1: Triage (main context)

For each issue number provided:

1. Fetch the full issue description using `mcp__linear-server__get_issue`.
2. Investigate the codebase to determine if the issue is valid:
   - Find the files/functions mentioned in the issue description.
   - Read the relevant code and assess whether the described bug or problem actually exists.
3. Produce a summary table for the user:

| Issue | Title | Verdict | Reasoning |
|-------|-------|---------|-----------|
| A-XXX | ...   | Valid / Invalid / Unclear | One-line explanation |

4. Ask the user which issues to proceed with. Default is all valid issues.
5. For each confirmed issue, set its Linear status to "In Progress" using `mcp__linear-server__save_issue`.

## Phase 2: Implementation

Work through each confirmed issue **sequentially** in the main checkout:

1. **Stash & branch**: Stash any uncommitted changes, then create a branch from `merge-train/spartan` using the issue's `gitBranchName` from Linear.
   ```
   git stash
   git checkout -B <gitBranchName> origin/merge-train/spartan
   ```

2. **Implement the fix**: Edit the relevant files.

3. **Build**: Run `yarn build` from `yarn-project` to verify the fix compiles.

4. **Commit**: Stage only the changed files and commit with a descriptive message.
   - Message format: `fix: <short description> (A-XXX)`
   - Include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

5. **Push & PR**: Push the branch and create a draft PR.
   ```
   git push -u origin <gitBranchName>
   gh pr create --draft --base merge-train/spartan --title "fix: ..." --body "..."
   ```
   - The PR body should reference the Linear issue (e.g. `Fixes A-XXX`).

6. **Return to original branch**: Switch back and restore stashed changes before moving to the next issue.
   ```
   git checkout <original-branch>
   git stash pop
   ```

Repeat for each issue.

## After all issues are done

Report a summary table with the PR URL for each issue, or what went wrong if any failed.

| Issue | Title | PR |
|-------|-------|----|
| A-XXX | ...   | URL or error |
