# `.claude/`

Project-level Claude Code configuration for aztec-packages. This file documents layout decisions; the filesystem describes the contents.

## Layout rules

1. Universal content lives at repository root: `CLAUDE.md`, `.claude/agents/`, `.claude/scripts/`, and the root `settings.json` hooks.
2. Subdirectory `.claude/` directories hold only component-specific skills, permission allowlists, and settings. Content is not merged upward.
3. A subdirectory that has its own `.claude/` must symlink `agents/` to the repository root's `.claude/agents/`. Claude Code's ancestor walk stops at the nearest `.claude/` and does not merge ancestors, so subdirectories otherwise shadow the root agents. Subdirectories without their own `.claude/` inherit the root automatically. `skills/` is intentionally *not* symlinked — skills are scoped to their subdir (root skills are repo-wide workflows; `barretenberg/.claude/skills/` are barretenberg-specific).
4. Each `.codex/` is a real directory whose immediate children symlink to its sibling `.claude/` entries. Keep `.claude/` canonical and do not duplicate agent or skill indexes in `AGENTS.md`. A sandbox cannot make a `.codex` path read-only when `.codex` itself is a symlink inside a writable workspace.
5. Put prose guidance in `CLAUDE.md` XML sections. Use `.claude/rules/` only for rules that need YAML frontmatter (for example `paths:`). Rules without frontmatter do not load when Claude Code starts in a subdirectory.

## Tests

- `tests/agents_symlink_test` enforces rules 3-4: `agents/` symlinks, `.codex/` mirrors, and `AGENTS.md -> CLAUDE.md`. It needs a checkout with `core.symlinks=true`.
- `tests/format_file_test` exercises each dispatch branch of the PostToolUse format hook: hygiene (malformed hook input), C++, Rust, Solidity, TypeScript with plugin.

Run all tests with `make claude-tests` or `./.claude/bootstrap.sh test`. List them with `./.claude/bootstrap.sh test_cmds`, which follows the same convention as `ci3/bootstrap.sh`. Run one test directly with `./.claude/tests/<name>`.

## Adding new files

- A new agent used repository-wide: `.claude/agents/` at root.
- A new skill scoped to one component: `component/.claude/skills/`.
- A new hook: add a script to `.claude/scripts/`, register it in `.claude/settings.json` so the path resolves from any cwd, and add a test in `.claude/tests/`. Resolve the path with `$CLAUDE_PROJECT_DIR` (the WebFetch hook) or `git rev-parse --show-toplevel` (the format hook); both work from a git checkout. Hooks are registered only in the root `.claude/settings.json` today. Add the hook to each subdirectory `settings.json` where you want it active.
- A new `.claude/` subdirectory: symlink `agents/` back to the repository root's `.claude/agents/`.

## Prerequisites

The `create-issue`, `cycle` and `fix` skills call a Linear MCP server named `linear-server`. The repo does not configure it (there is no `.mcp.json`). Add it to your user-level Claude Code config.
