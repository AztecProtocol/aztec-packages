---
name: worktree-spawn
description: Spawn an independent Claude instance in a git worktree to work on a task in parallel. Use when the user wants to delegate a task to run independently while continuing the current conversation.
argument-hint: <task description>
---

# Worktree Spawn

Spawn an independent Claude instance in a separate git worktree to work on a task in parallel.

## When to Use

- User wants to delegate a task to run independently
- Task can be completed without further interaction
- User wants to continue working on something else in the current session

## Workflow

1. Choose a short worktree name from the task description (e.g. `fix-bug-123`)
2. Create the worktree with `scripts/worktrees.sh create` — NOT with bare `git worktree add`. The script
   creates the worktree at `~/Projects/<name>` on branch `spl/<name>`, initializes the `noir/noir-repo`
   submodule, copies the writable yarn layer (`node_modules`, build outputs) from the current checkout, and
   links upstream build artifacts (bb, nargo, contract artifacts, l1 out) from the shared read-only store —
   leaving the worktree ready to build and test in minutes instead of a full bootstrap
3. Spawn Claude in the worktree with a detailed task prompt

## Command Template

```bash
cd $(git rev-parse --show-toplevel) && \
scripts/worktrees.sh create <name> [base-ref] && \
cd ~/Projects/<name>/yarn-project && \
claude "$(cat <<'EOF'
Task: [Brief task description]

Steps:
1. [Step 1]
2. [Step 2]
...

IMPORTANT: Read CLAUDE.md first to understand the project structure and workflow.

[Any additional context or requirements]
- Working directory: yarn-project in the worktree
- Branch: spl/<name>
- PR target: next (unless specified otherwise)
EOF
)"
```

- `base-ref` defaults to the current checkout's HEAD. Pass `origin/next` (or another CI-built ref) when the
  task should start from the latest base instead.
- Use `--branch <branch>` to override the default `spl/<name>` branch name.
- If the script reports upstream cache misses, the affected components compile locally — slower but correct.
  `--frozen-only` aborts instead of building on a miss.

## Example

For a task "Fix bug #123 in the sequencer":

```bash
cd $(git rev-parse --show-toplevel) && \
scripts/worktrees.sh create fix-bug-123 && \
cd ~/Projects/fix-bug-123/yarn-project && \
claude "$(cat <<'EOF'
Task: Fix bug #123 in the sequencer

Steps:
1. Investigate the issue in sequencer package
2. Implement fix
3. Add tests
4. Compile and run tests
5. Commit and create PR

IMPORTANT: Read CLAUDE.md first to understand the project structure and workflow.
EOF
)"
```

## Key Points

- Always use `scripts/worktrees.sh create` — it replaces the full bootstrap with shared cached artifacts.
  See `scripts/worktrees.sh --help` for what is symlinked vs copied and how to refresh after a rebase
- Upstream artifacts (bb, nargo, contract artifacts) are read-only symlinks into a shared store: do NOT
  rebuild upstream components or run codegen in the worktree without `scripts/worktrees.sh thaw` first
- Rebuilding yarn-project workspaces (`yarn build`, `yarn workspace ... build`) is safe — those are
  worktree-local copies
- When done, remove with `git worktree remove ~/Projects/<name>`; run `scripts/worktrees.sh gc` occasionally
  to clean orphaned store entries
- The spawned Claude instance works independently from the current session
- PR target is `next` unless specified otherwise
