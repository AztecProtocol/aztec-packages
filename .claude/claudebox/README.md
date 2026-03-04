# ClaudeBox

ClaudeBox runs Claude agents in isolated Docker containers, triggered from Slack or HTTP.
Each agent gets its own git worktree and can create PRs, post to Slack, and run CI.

## Architecture

```
Slack (Socket Mode)  ─┐
                       ├─▶  server.ts  ─▶  Docker container (Claude)
HTTP API (/run)       ─┘       │                  │
                               │            MCP sidecar
                          Session store      (GitHub, Slack, gist)
                          Bindings index
```

- **`server.ts`** — Slack bot + HTTP server + session lifecycle. Runs as `systemd claudebox-slack.service` on the host.
- **`mcp-sidecar.ts`** — MCP tool server inside each container (bind-mounted, not baked into the image). Provides `github_api`, `slack_api`, `create_pr`, `create_gist`, etc.
- **`lib/docker.ts`** — Container creation, networking, and cleanup.
- **`lib/session-store.ts`** — Session metadata, worktree management, and bindings.
- **`lib/slack-handlers.ts`** — Slack event dispatch (mentions, DMs, slash commands).
- **`lib/slack-helpers.ts`** — Session start/reply helpers and Slack message formatting.
- **`lib/http-routes.ts`** — HTTP API and dashboard.
- **`lib/interactive.ts`** — WebSocket TTY bridge for interactive terminal sessions.
- **`Dockerfile`** — Claude agent container image.
- **`container-entrypoint.sh`** — Container entrypoint that launches Claude CLI.

## Session binding

Slack threads and GitHub PRs are each bound to **one worktree** at a time.

- When a Slack thread triggers its first session, the thread is bound to the new worktree.
  Every subsequent reply in that thread automatically resumes the same worktree.
- When a GitHub PR triggers a session (via `POST /run` with a `link` field), the PR is
  bound to the worktree. Future runs for the same PR reuse it.
- **`new-session`** clears the binding so a fresh worktree is created. The old worktree
  remains accessible via the status page (`/s/<id>`).

Bindings are stored in `~/.claudebox/bindings.json` and are checked before falling back
to a file scan of session metadata.

### Keywords

Prefixed to the prompt text, in any order:

| Keyword | Effect |
|---------|--------|
| `new-session` | Break the thread/PR binding; create a fresh worktree |
| `quiet` | Suppress Slack activity updates |
| `loud` | Force Slack activity updates (overrides channel default) |
| `ci-allow` / `allow-ci` | Allow the agent to trigger CI pipelines |

### Resume behavior

Within a worktree, each run is a separate Claude session that automatically resumes
the previous session's context (via `CLAUDEBOX_RESUME_ID`). This means the agent
retains memory of prior work in the same worktree.

## Entry points

### Slack

1. **@mention** in a channel — `@ClaudeBox <prompt>`
2. **Direct message** — just send text
3. **`/claudebox` slash command** — `/claudebox <prompt>`

Thread replies resume the bound worktree. Top-level messages create new sessions.

### HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/run` | Bearer | Start a session (used by GitHub Actions) |
| `GET` | `/session/<id>` | Bearer | Session status (JSON) |
| `GET` | `/s/<id>` | Public | Status page (HTML) |
| `POST` | `/s/<id>/resume` | Basic | Resume in same worktree |
| `POST` | `/s/<id>/cancel` | Basic | Stop a running session |
| `DELETE` | `/s/<id>` | Basic | Delete worktree to free disk |
| `GET` | `/dashboard` | Public | Workspace dashboard |
| `POST` | `/api/sessions` | Basic | Start session from dashboard |

### IDs

| Format | Example | Meaning |
|--------|---------|---------|
| 16-hex | `d9441073aae158ae` | Worktree ID (stable across runs) |
| `<wt>-<seq>` | `d9441073aae158ae-3` | Session log ID (unique per run) |
| 32-hex | `a1b2c3...` | Legacy session hash (still supported) |

## Container mounts

The Claude container mounts `~/.claude` from the host for auth and settings.
The worktree's `claude-projects/` dir is overlaid at **two** project-key paths:

- `~/.claude/projects/-workspace` — project key when cwd is `/workspace` (before clone)
- `~/.claude/projects/-workspace-aztec-packages` — project key after `clone_repo` changes cwd

Both must be mounted so Claude CLI can find prior session JSONL regardless of when
the cwd changed. Without the second mount, resume silently fails because Claude looks
in the host's (stale) `-workspace-aztec-packages` dir instead of the worktree's.

The `~/.claude` parent mount is `:rw` because Claude CLI writes to `history.jsonl`,
`todos/`, `debug/`, etc. during normal operation. The child project mounts overlay
the parent and take precedence for their paths.

## Deployment

Changes to `mcp-sidecar.ts` take effect for new sessions immediately (bind-mounted).
Changes to `server.ts` or `lib/` require:

```bash
systemctl --user restart claudebox-slack
```

Changes to `Dockerfile` require:

```bash
docker build -t claudebox:latest .claude/claudebox/
```

The Cloudflare tunnel (`cloudflared.service`) proxies HTTPS traffic to the local HTTP server.
