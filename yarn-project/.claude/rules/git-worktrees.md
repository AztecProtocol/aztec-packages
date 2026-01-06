# Working in Parallel with Git Worktrees

When Claude needs to work on a task independently in a separate worktree:

## Command Template

```bash
cd $(git rev-parse --show-toplevel) && \
git worktree add -b <author>/<branch-name> ../<worktree-dir-name> && \
cd ../<worktree-dir-name>/yarn-project && \
claude "$(cat <<'EOF'
Task: [Brief task description]

Steps:
1. [Step 1]
2. [Step 2]
...

IMPORTANT: Read CLAUDE.md first to understand the project structure and workflow.

[Any additional context or requirements]
- Working directory: yarn-project in the worktree
- Branch: <author>/<branch-name>
- PR target: next (unless specified otherwise)
EOF
)"
```

## Example

```bash
cd $(git rev-parse --show-toplevel) && \
git worktree add -b jd/fix-bug-123 ../aztec-fix-bug && \
cd ../aztec-fix-bug/yarn-project && \
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

- Always go to git root first before creating worktree
- Use `-b` flag to create new branch
- Navigate to `yarn-project` within the worktree
- Always include "Read CLAUDE.md first" in the prompt
- Worktree directories are typically named `../aztec-<feature-name>`
- The spawned Claude instance works independently from your current session
