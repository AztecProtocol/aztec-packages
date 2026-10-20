---
name: fix
description: Analyze Linear issues, validate them against the codebase, then implement fixes and create draft PRs.
argument-hint: <issue-numbers, e.g. A-690 A-691 A-692>
---

# Fix Issues

Given a list of Linear issue numbers, analyze each one against the codebase, then implement fixes and create draft PRs.

Requires a Linear MCP server named `linear-server` in your user-level Claude Code config. The repo does not configure one.

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

1. **Stash & branch**: Stash any uncommitted changes, then create a branch from `next` using the issue's `gitBranchName` from Linear (or the component's merge train, see CLAUDE.md). For a fix scoped to a release line, branch from that line instead (`v6`, `v5-next`). Take `<base>` from the base-branch table in `CLAUDE.md`.
   ```
   git stash
   git checkout -B <gitBranchName> origin/<base>
   ```

2. **Implement the fix**: Edit the relevant files.

3. **Build**: Build the component you touched to verify the fix compiles: `make bb-cpp-native`, `make l1-contracts`, `make noir-projects-fnd`, or `make labs-yarn-project` for labs changes.

4. **Commit**: Stage only the changed files and commit with a descriptive message.
   - Message format: `fix: <short description> (A-XXX)`

5. **Push & PR**: Push the branch and create a draft PR. Use the same `<base>` as the branch.
   ```
   git push -u origin <gitBranchName>
   gh pr create --draft --base <base> --title "fix: ..." --body "..."
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
