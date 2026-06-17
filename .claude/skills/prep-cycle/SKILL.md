---
name: prep-cycle
description: Build or adjust a Linear cycle — for a whole team or just yourself. Size capacity from last-3-cycle velocity, fill with backlog bugs/high-priority items first and project work after (in your chosen project focus order), with no unassigned issues. Use when planning/prepping a cycle for a team, or when one member wants to fill/rebalance their own cycle work.
---

# Prepare a Cycle

Assemble a capacity-sized cycle by **curating existing issues** (from focus projects + the backlog) — not by authoring new ones. The output is a cycle where each in-scope member is loaded up to their historical velocity, high-priority/bug work sits ahead of project work, and nothing in scope is unassigned.

If you do need to *create* a missing issue along the way, follow the [[create-issue]] standard for it.

## Before you start — resolve scope, team & target

1. **Scope** — determine who this run is for:
   * **Whole team** — prep/rebalance the cycle for every included member (the default when prepping a team's cycle).
   * **Just me / a single member** — a member filling or adjusting *their own* cycle work. Skip the roster-inclusion prompt entirely; the one member is the roster. Resolve "me" via `get_user` ("me"), or use the named member.
   If the request doesn't make scope obvious (e.g. "prep Alpha's cycle" → team; "fill my cycle" / "sort out my sprint" → self), ask which.
2. **Team** — the skill is team-agnostic; **always ask which team** unless the user already named one. Resolve options from `get_user` ("me") / `list_teams`. In self mode, default to the team that owns the target cycle.
3. **Target cycle** — ask whether you're filling the **current** cycle or the **next** one. Get cycle numbers via `list_cycles` (type `current` / `next`). Call the target cycle's number `C`.
4. **Build vs adjust** — a target cycle may already hold issues. If so, ask whether to **top up** in-scope members to capacity (leave existing cycle items in place, only add) or **rebalance** (also reconsider what's there). Either way, only ever touch the in-scope members' own work — never move or reassign another member's issues.

## Step 1 — Roster & focus (prompt per in-scope member)

* **Inclusion** — *team mode only.* Get the team's members (`get_team` / `list_users team:<team>`) and ask which are in this cycle (`AskUserQuestion` multiSelect; if more than 4 members, split across questions, max 4 options each). If the team has a **default roster** below, pre-select those as the default and just confirm. In self mode, skip this — the single member is the roster.

  **Default rosters** (the usual cycle members for a team; confirm, don't assume):
  * **Alpha** — Phil, Palla, Alex, Facundo, Spyros.

  Add other teams' defaults here as they're established.
* **Project focus order** — for each in-scope member, ask the **ordered** list of projects they focus on (first = highest focus). `AskUserQuestion` options don't encode order reliably, so either ask the projects as a multiSelect then confirm the resolved order back in text, or ask the user to state the order explicitly. List the team's projects (`list_projects team:<team>`) as the option set. In self mode this is just one quick question for the calling member.

Record, per in-scope member: `{ projects: [ordered] }`. Out-of-scope members get nothing assigned and their existing work is left untouched.

## Step 2 — Size capacity from the last 3 cycles

For each in-scope member `m`, compute their **per-cycle velocity** from completed work:

* For each of cycle numbers `C-1`, `C-2`, `C-3`: `list_issues` with `cycle:<number>`, `assignee:<m>`, and a completed state filter (`state:Done` / completed-type). Sum the `estimate` of those issues → that cycle's completed points for `m`.
* `capacity(m) = round(mean of the available cycle totals)`. If `m` has fewer than 3 cycles of history, average over what exists. If `m` has **no** history, ask the user for a manual capacity rather than guessing.

Report the per-member capacities (and team total in team mode) before filling, so the user can adjust. The cycle is filled **up to** each member's capacity — never over it. In self mode, subtract any work already in the target cycle for `m` from their capacity so a top-up doesn't overload them.

> Only **completed** issues count (Linear "Done"/completed type). Canceled/Duplicate do not. Issues without an `estimate` contribute 0 to history and can't be allocated by points later — flag them (see Step 4).

## Step 3 — Backlog bugs & high-priority items go first

Pull **non-project** backlog work that must jump the queue:

* `list_issues` for the team with `state` of backlog/triage type and **no project**, filtered to: priority **Urgent (1)** or **High (2)**, OR carrying a bug label (`Bug`). Run the queries you need and dedupe.
* **Team mode:** for each such issue ensure an assignee — keep the existing one; if **unassigned**, ask the user who to assign it to (these cannot stay unassigned), preferring the member whose focus/expertise fits.
* **Self mode:** only pull items already assigned to `m`, plus unassigned ones the member explicitly chooses to take — don't hand out bugs to other people. Leave items assigned to others alone.
* Add each in-scope item to the target cycle. These count against that member's `capacity(m)` and are placed **ahead** of their project work (see ordering note below).

## Step 4 — Fill remaining capacity with project work (in focus order)

For each included member `m`, after their Step-3 items, walk their `projects` in focus order and pull issues to fill the rest of `capacity(m)`:

* `list_issues` per project, restricted to unstarted/backlog issues. Within a project, take them in priority order (Urgent → High → Medium → Low), then backlog order.
* Assign each pulled issue to `m` (if it already has a different assignee, leave it for that person and skip — don't reassign someone else's in-progress work) and set its `cycle` to the target.
* Keep a running total; stop adding to `m` once the next issue would exceed `capacity(m)`. Move to the next project in focus order only while capacity remains.
* **Issues with no estimate** can't be point-allocated. Don't silently skip or guess: **propose an estimate** on the 1/2/3/5 scale (per [[create-issue]]) from the issue's scope/complexity, **prompt the user to confirm or correct it**, then write it back with `save_issue` (`estimate`) before counting it toward capacity. Batch these confirmations (one prompt covering several issues) rather than one prompt per issue.

Don't assign the same issue to two members. If a project appears in multiple members' focus lists, split its issues between them as you go.

## Step 5 — Enforce: no unassigned items

Everything **this run added** to the cycle must have an assignee. In team mode, `list_issues cycle:<C> assignee:null` for the team must come back **empty** — assign anything unassigned (ask when the owner isn't obvious) or remove it. In self mode, only guarantee this for the items you added/own; don't touch pre-existing unassigned issues you didn't put there (mention them if you spot them).

## Step 6 — Write & report

* Apply changes with `save_issue` (`id`, `cycle:<C>`, `assignee`) per issue.
* Report a per-member summary: capacity, points allocated, the ordered list of issues (bugs/high-priority first, then project work by focus order), and any flagged items (no estimate, newly assigned, capacity left unfilled because the projects ran dry).

## Ordering note (Linear limitation)

This MCP can't set a manual board position within a cycle, so "ahead of project work" is expressed through **priority** — Urgent/High bug items already sort above Medium project work. If a strict manual order is needed beyond what priority gives, call it out so the user can drag-order in the Linear UI.

## Tools

`get_user`, `get_team`, `list_users`, `list_projects`, `list_cycles`, `list_issues` (by `cycle` / `project` / `assignee` / `state` / `priority` / `label`), `save_issue` (set `cycle`, `assignee`, `estimate`).

**Linear MCP reliability (learned the hard way — follow exactly):**
- **Apply `save_issue` writes ONE AT A TIME, never in parallel.** Multiple `save_issue` calls issued together in one turn get silently dropped — only some persist. Sequential, one write per turn, is reliable.
- **All reads lag (eventual consistency)** — `list_issues`, `save_issue` echoes, *and even `get_issue`* can return pre-write state for several seconds after a write. A "missing" change is usually read-lag, not a failed write. To confirm: re-issue the (idempotent) `save_issue` and check that its echo reflects the change (the echo returns the last *persisted* state), rather than trusting one `get_issue`.
- `list_issues` for a whole cycle/large project can exceed the output limit and be saved to a file — filter (by `state`/`priority`/`assignee`) or `jq` the file instead of widening the limit.
- Large multi-cycle history: query per cycle and aggregate completed `estimate` by assignee with `jq`.
