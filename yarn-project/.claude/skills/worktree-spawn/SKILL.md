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
2. Create the worktree. If `CACHE_LOCAL_DIR` is set in the environment, use
   `scripts/worktrees.sh create` (fast path, see the `worktrees` skill): it creates the worktree as
   a sibling of the source checkout (`<parent-of-checkout>/<name>`) on a new branch
   (`<initials>/<name>`, from the checkout's git `user.initials`/`user.name`), initializes the
   `noir/noir-repo` submodule, copies the writable yarn layer (`node_modules`, build outputs) from
   the source checkout, and links upstream build artifacts (bb, nargo, contract artifacts, l1 out)
   from the shared read-only store — leaving the worktree ready to build and test in minutes
   instead of a full bootstrap. If `CACHE_LOCAL_DIR` is NOT set, bail to a vanilla worktree (see
   fallback below) — do not use `worktrees.sh` with an unset cache dir.
3. Spawn Claude in the worktree with a detailed task prompt

## Command Template (fast path, requires CACHE_LOCAL_DIR)

The worktree path and branch are derived by the script (sibling dir of the checkout, branch prefixed
with your git initials). Use `--dry-run` first to learn the resolved path, then create and spawn in
it. Invoke the script via the git root — yarn-project sessions have CWD `yarn-project`.

```bash
WT="$(git rev-parse --show-toplevel)/scripts/worktrees.sh" && \
WT_PATH=$("$WT" create <name> [base-ref] --dry-run 2>&1 | awk '/^  path:/{print $2}') && \
"$WT" create <name> [base-ref] && \
cd "$WT_PATH/yarn-project" && \
claude "$(cat <<'EOF'
Task: [Brief task description]

Steps:
1. [Step 1]
2. [Step 2]
...

IMPORTANT: Read CLAUDE.md first to understand the project structure and workflow.

[Any additional context or requirements]
- Working directory: yarn-project in the worktree
- PR target: next (unless specified otherwise)
EOF
)"
```

- `base-ref` defaults to the current checkout's HEAD. Pass `origin/next` (or another CI-built ref) when the
  task should start from the latest base instead.
- The default branch is `<initials>/<name>` (initials from the checkout's `user.initials`, else derived from
  `user.name`). To set the branch explicitly, either pass `--branch <branch>`, or give `<name>` itself with a
  slash — e.g. `create ab/fix-thing` makes branch `ab/fix-thing` with the worktree dir `fix-thing`.
- If the script reports upstream cache misses, the affected components compile locally — slower but correct.
  `--frozen-only` aborts instead of building on a miss.

## Vanilla Fallback (CACHE_LOCAL_DIR not set)

```bash
cd $(git rev-parse --show-toplevel) && \
git worktree add -b <initials>/<branch-name> ../<worktree-dir-name> && \
cd ../<worktree-dir-name>/yarn-project && \
claude "<task prompt as above, plus: run ./bootstrap.sh from the git root before building>"
```

## Example

For a task "Fix bug #123 in the sequencer" (with `CACHE_LOCAL_DIR` set):

```bash
WT="$(git rev-parse --show-toplevel)/scripts/worktrees.sh" && \
WT_PATH=$("$WT" create fix-bug-123 --dry-run 2>&1 | awk '/^  path:/{print $2}') && \
"$WT" create fix-bug-123 && \
cd "$WT_PATH/yarn-project" && \
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

- Use `scripts/worktrees.sh create` when `CACHE_LOCAL_DIR` is set — it replaces the full bootstrap with
  shared cached artifacts. See the `worktrees` skill for what is symlinked vs copied, thaw, and
  troubleshooting. Without `CACHE_LOCAL_DIR`, use the vanilla fallback
- In a linked worktree, upstream artifacts (bb, nargo, contract artifacts) are read-only symlinks into a
  shared store: do NOT rebuild upstream components or run codegen in the worktree without
  `scripts/worktrees.sh thaw` first
- Rebuilding yarn-project workspaces (`yarn build`, `yarn workspace ... build`) is safe — those are
  worktree-local copies
- When done, remove with `git worktree remove <worktree-path>` (the sibling dir printed at create time); run
  `scripts/worktrees.sh gc` occasionally to clean orphaned store entries
- The spawned Claude instance works independently from the current session
- PR target is `next` unless specified otherwise
