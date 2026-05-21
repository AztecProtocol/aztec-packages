# `.claude/`

Project-level Claude Code configuration for aztec-packages. This file documents layout decisions; the filesystem describes the contents.

## Layout rules

1. Universal content lives at repository root: `CLAUDE.md`, `.claude/agents/`, `.claude/scripts/`, and the root `settings.json` hooks.
2. Subdirectory `.claude/` directories hold only component-specific skills, permission allowlists, and settings. Content is not merged upward.
3. A subdirectory that has its own `.claude/` must symlink `agents/` to the repository root's `.claude/agents/`. Claude Code's ancestor walk stops at the nearest `.claude/` and does not merge ancestors, so subdirectories otherwise shadow the root agents. Subdirectories without their own `.claude/` inherit the root automatically. `skills/` is intentionally *not* symlinked — skills are scoped to their subdir (root skills are repo-wide workflows; `yarn-project/.claude/skills/` are TS-specific; etc.).
4. Tracked `.codex` symlinks point at the nearest `.claude/` directory. Keep `.claude/` canonical and do not duplicate agent or skill indexes in `AGENTS.md`.
5. Prefer XML-tagged sections inside `CLAUDE.md` for prose guidance. A `.claude/rules/` directory is only warranted when a rule needs YAML frontmatter (e.g. path-scoped `paths:` metadata) that `CLAUDE.md` cannot express. `.claude/rules/` without frontmatter does not auto-load when Claude Code is started from a subdirectory, so plain rules files are strictly worse than inlining into `CLAUDE.md`.

## Tests

`tests/format_file_test` exercises each dispatch branch: hygiene (malformed hook input), C++, Rust, Solidity, TypeScript with plugin. Invocation via `./.claude/bootstrap.sh test_cmds` follows the same convention as `ci3/bootstrap.sh`.

## Adding new files

- A new agent used repository-wide: `.claude/agents/` at root.
- A new skill scoped to one component: `component/.claude/skills/`.
- A new hook: add a script to `.claude/scripts/`, register it in `.claude/settings.json` via `git rev-parse --show-toplevel` so the path resolves from any cwd, and add a test in `.claude/tests/`. You need to add it to each subdirectory where you want the hook active.
- A new `.claude/` subdirectory: symlink `agents/` back to the repository root's `.claude/agents/`.
