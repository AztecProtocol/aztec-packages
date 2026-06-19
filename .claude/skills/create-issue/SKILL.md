---
name: create-issue
description: Create a well-formed Linear issue — with complete context for a fresh agent, a point estimate (1/2/3/5), and acceptance criteria. Works standalone or as part of planning a project with multiple issues. Use when asked to file/create/open a Linear issue, "make a ticket", or when breaking a plan into tracked work.
---

# Create a Linear Issue

Turn a unit of work — a bug, a CI failure, a task, or one slice of a larger plan — into a Linear issue that a **fresh agent with no prior context** could pick up and execute end-to-end. The default failure mode is an under-specified ticket; the whole point of this skill is to prevent that.

## Two modes

This skill applies in two situations. The difference is only *how much you already know* — the quality bar for the issue body is identical.

- **Standalone** — the user asks you to file a single issue. You likely need to ask for team, project, labels, and priority.
- **Planning / project breakdown** — you've been designing a project with the user and are now creating one or more issues under it. The project, team, labels, milestones, and conventions are already established in the conversation — **inherit them, don't re-ask.** Apply the same project/labels/priority conventions across the set, set `parentId` or `project` accordingly, and use `blockedBy`/`blocks` to encode dependencies between the issues you create. Only ask when something is genuinely ambiguous.

## Principle: the issue must be self-contained

Whoever (or whatever) picks up the issue will not have seen this conversation. Before writing, gather the real context — read the PR/diff, the failing test, the relevant source files, the CI log, the design discussion — and put the *findings* into the issue, not a pointer to "go investigate". A good issue includes:

- **Summary** — one paragraph: what the work is and what the resolution looks like.
- **Context / evidence** — for a bug: the actual error output, failing test name, log excerpt, or reproduction (paste it, don't just link it). For planned work: the relevant design decisions and constraints from the discussion.
- **Approach / root cause** — the *why* and the *how*, with concrete file paths and line references (`path/to/file.ts:63`). For a bug, the root cause; for a feature, the intended approach. If something is genuinely unknown, say so explicitly and scope the issue as an investigation.
- **The change** — the specific work to do, including code snippets where they clarify. Call out anything that looks like an obvious approach but is **wrong**, and why (saves the next agent from a dead end).
- **Acceptance criteria** — see below; always required.
- **References** — PRs, related issues, branches, dashboards, design docs.

Match scope to the work: a one-line fix needs a short issue, a feature needs more. But "self-contained" is non-negotiable at every size.

## Acceptance criteria are required

Every issue gets a checklist of concrete, verifiable criteria that define "done". Each item must be objectively checkable — a test passes, a value is set, a behavior changes — not vague ("works better"). Include negative criteria where relevant ("does NOT also add X, because Y"). If you cannot write acceptance criteria, the issue is too vague to file — clarify it first.

## Point estimate (the scoring system)

Estimates use the scale **1, 2, 3, 5** (no other values). Roughly:

- **1** — trivial, fully understood. A known one-line / few-line change with the diagnosis already done. Minimal risk.
- **2** — small and well-understood, but more than trivial: a handful of files, or a tiny change that still needs non-trivial verification (e.g. landing a timing-sensitive test through CI).
- **3** — medium. Real implementation work, multiple files, or meaningful unknowns to resolve along the way.
- **5** — large. Substantial work, cross-cutting changes, or significant design/unknowns. If it feels bigger than 5, it should probably be split into multiple issues.

Pick the estimate, then state your reasoning to the user in one line so they can override (they often will). Set it via the `estimate` field on `save_issue`.

## What to confirm (ask only what you don't already know)

In planning mode most of these are already settled — inherit them. In standalone mode, use `AskUserQuestion` to resolve anything unclear rather than guessing:

1. **Team** — which Linear team. Get the user's teams from `get_user` (query `"me"`); offer them as options. Required to create an issue.
2. **Project** — whether to attach to a project. If a project is being planned, use it. Otherwise ask, and if yes, list the team's projects (`list_projects`) to choose.
3. **Labels** — which labels to apply. Fetch the team's labels (`list_issue_labels` with the team) and offer the relevant ones as a multi-select rather than a blank prompt. In planning mode, apply the project's agreed label convention.
4. **Priority** — if not already stated or implied by the plan, ask. Linear priority values: `1`=Urgent, `2`=High, `3`=Medium, `4`=Low, `0`=None.

If the user already specified any of these, honor it and don't re-ask.

## Standard fields

- **Assignee** — `assignee` accepts `"me"`, a name, email, or user ID.
- **Cycle** — "this cycle" / "current cycle": call `list_cycles` with the team's ID and `type: "current"`, then pass the cycle number or ID to the `cycle` field.
- **Parent / dependencies** — `parentId` for sub-issues; `blockedBy` / `blocks` to encode ordering between issues created from the same plan.
- **Links** — attach source PRs/runs/docs via the `links` field (`[{url, title}]`).

## Steps

1. Gather context for the unit of work — read PR/diff/logs/source/design as relevant. Do not file from memory alone.
2. Decide the point estimate (1/2/3/5) and draft acceptance criteria.
3. Resolve team, project, labels, priority. In planning mode inherit them from the project; in standalone mode `get_user` ("me") and ask for anything not already specified.
4. If "this cycle", resolve the current cycle via `list_cycles`.
5. Create with `mcp__linear-server__save_issue` (`team`, `title`, `description` in Markdown, `assignee`, `priority`, `estimate`, `cycle`, `labels`, `project`, `parentId`, `blockedBy`/`blocks`, `links` as applicable).
6. Report each created issue's identifier and URL, and state the estimate + reasoning so the user can adjust.

## Notes

- `save_issue` `description` takes Markdown with **literal** newlines — do not escape them.
- Re-running `save_issue` with an `id` updates the issue (e.g. to change the estimate after the user weighs in).
- When creating several issues from one plan, keep titles, labels, and estimate reasoning consistent across the set.
