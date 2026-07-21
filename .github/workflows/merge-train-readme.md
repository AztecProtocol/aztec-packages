# Merge Train Documentation

## Skills

The merge-train system is documented via Claude Code skills in `.claude/skills/`. These are structured markdown files designed to be consumed by LLMs (such as Claude) to answer interactive questions about the system.

| Skill | Description |
|---|---|
| [`merge-trains`](../../.claude/skills/merge-trains/SKILL.md) | Contributor-facing guide -- creating PRs, choosing the right base branch, understanding labels, CI behavior, handling failures, and bypassing checks. |
| [`merge-train-infra`](../../.claude/skills/merge-train-infra/SKILL.md) | Infrastructure reference -- workflows, scripts, CI integration, configuration, and how to create a new merge train. |

### Using the Skills

Ask Claude Code questions like:
- "How do I add my PR to a merge train?"
- "What happens when a merge-train CI run fails?"
- "How do I create a new merge-train branch?"
- "How does the auto-merge system work?"

Claude will load the relevant skill and provide contextual answers based on the actual automation code.
