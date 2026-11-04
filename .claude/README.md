# `.claude/`

Project-level Claude Code configuration for aztec-packages. This file documents layout decisions; the filesystem describes the contents.

## Layout rules

1. Universal content lives at repository root: `CLAUDE.md`, `.claude/agents/`, `.claude/scripts/`, and the root `settings.json` hooks.
2. Subdirectory `.claude/` directories hold only component-specific skills, permission allowlists, and settings. Content is not merged upward.
3. A subdirectory that has its own `.claude/` must symlink `agents/` to the repository root's `.claude/agents/`. Claude Code's ancestor walk stops at the nearest `.claude/` and does not merge ancestors, so subdirectories otherwise shadow the root agents. Subdirectories without their own `.claude/` inherit the root automatically. `skills/` is intentionally *not* symlinked — skills are scoped to their subdir (root skills are repo-wide workflows; `barretenberg/.claude/skills/` are barretenberg-specific).
4. Each `.codex/` is a real directory whose immediate children symlink to its sibling `.claude/` entries. Keep `.claude/` canonical and do not duplicate agent or skill indexes in `AGENTS.md`. A sandbox cannot make a `.codex` path read-only when `.codex` itself is a symlink inside a writable workspace.
5. Put prose guidance in `CLAUDE.md` XML sections. Use `.claude/rules/` only for rules that need YAML frontmatter (for example `paths:`). Rules without frontmatter do not load when Claude Code starts in a subdirectory.

## Tests

`tests/agents_symlink_test` enforces rules 3-4 (`agents/` symlinks, `.codex` mirrors, `AGENTS.md -> CLAUDE.md`). `tests/format_file_test` exercises each dispatch branch of the PostToolUse format hook: hygiene (malformed hook input), C++, Rust, Solidity, Noir (hint only; `nargo fmt` is crate-scoped), TypeScript with plugin.

List the tests with `./.claude/bootstrap.sh test_cmds`; run them with `./.claude/bootstrap.sh test`. In CI, `make claude-tests` queues them for the test engine. Run one directly with `./.claude/tests/<name>`. This follows the same convention as `ci3/bootstrap.sh`.

## Adding new files

- A new agent used repository-wide: `.claude/agents/` at root.
- A new skill scoped to one component: `component/.claude/skills/`.
- A new hook: add a script to `.claude/scripts/`, register it in `.claude/settings.json` with a path that resolves from any cwd (`$CLAUDE_PROJECT_DIR/...` or `git rev-parse --show-toplevel`; both forms are in use and equivalent from a git checkout), and add a test in `.claude/tests/`. You need to add it to each subdirectory where you want the hook active.
- A new `.claude/` subdirectory: symlink `agents/` back to the repository root's `.claude/agents/`.

## Prerequisites

The `create-issue`, `cycle` and `fix` skills call a Linear MCP server named `linear-server`. The repo does not configure it (there is no `.mcp.json`). Add it to your user-level Claude Code config.
