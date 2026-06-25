---
name: monitor-pr
description: Monitor a PR on a ~10-minute loop and drive it to green and conflict-free — watch CI, dispatch fixers for failures (new commits, never amend), and resolve base conflicts (rebase by default, merge if the branch already merged the base). Stop and report when the PR is green with no conflicts.
argument-hint: <PR number>
---

# Monitor PR

A self-paced monitoring loop over a single PR. Each iteration takes a status snapshot, acts on it
(fix CI failures, resolve conflicts, or do nothing while CI is pending), then re-schedules itself
~10 minutes out. The loop ends — and reports success — only when the PR is green AND conflict-free.

This skill **composes** its siblings rather than re-deriving them:
- Fix CI failures the way `/fix-pr` does (delegating identification to the `identify-ci-failures`
  subagent, then root-causing the failure — preferring a real fix over a skip or flake flag).
- Resolve conflicts the way `/rebase-pr` does.

## Usage

```
/monitor-pr 19882
```

If no PR number is given, the loop targets the PR for the currently checked-out branch.

## Hard rules (read first)

- **New commits only — NEVER `git commit --amend`.** This loop runs unattended and re-pushes
  repeatedly; amending would rewrite work that may already be in flight. This overrides the
  amend-for-`next` guidance in `/fix-pr` and `/rebase-pr` — in *this* skill, every fix and every
  conflict resolution is a fresh commit.
- **Determine the base from the PR, never assume `master`/`main`.** The `baseRefName` from
  `gh pr view` is authoritative.
- **Never `git add -A`/`-u`/`.`.** Stage named files only (especially when dispatching a fixer
  agent, which lacks this session's context for judging which changes belong to the task).
- **Conventional-commit messages** (`fix:`, `refactor:`, …). **No `Co-Authored-By: Claude` trailer**
  and no "Generated with Claude Code" footer — the git author is the author of record.
- **Bounded — the loop must be able to give up.** This runs unattended; a failure the fixer cannot
  resolve would otherwise re-dispatch a fixer every iteration forever, churning commits and tokens.
  Track progress across iterations in a state file and **stop + escalate to the human** when stuck
  (see "Step 0" and "Giving up" below). Never loop indefinitely on a failure that is not improving.

## Iteration workflow

### Step 0 — Load loop state

Each firing of `/monitor-pr <PR>` is a **cold turn** — nothing carries over from the previous
iteration except what you persist. To detect lack of progress (and stop instead of looping forever),
keep a small JSON state file across iterations, in your session scratchpad dir, named
`monitor-pr-<PR>.json`:

```json
{ "iterations": 0, "lastHeadSha": "", "fixAttempts": { "<check name>": 0 } }
```

At the start of every iteration: read it (treat a missing file as the zero state above) and increment
`iterations`. You will update `lastHeadSha` and `fixAttempts` in Step 2, and write the file back
before rescheduling in Step 3.

### Step 1 — Snapshot the PR status

Run the bundled status script from inside the repo clone (it shells out to `gh`, `git`, `jq`):

```bash
bash "$CLAUDE_SKILL_DIR/check-pr.sh" <PR>      # or omit <PR> to use the current branch's PR
```

It prints parseable `KEY=VALUE` lines:

- `STATE` — abort the loop if not `OPEN` (report: "PR #N is <state>, nothing to monitor.").
- `BASE`, `HEAD` — base and head branch names (base is authoritative; use it everywhere below).
- `MERGEABLE` / `MERGE_STATE` — `CONFLICTING` or `MERGE_STATE=DIRTY` means there are conflicts.
- `HAS_BASE_MERGE_COMMITS` — `yes` if the branch already contains merge commit(s) from the base
  (`git log --merges origin/<base>..HEAD` is non-empty). This drives the rebase-vs-merge choice.
- `CI` — `PENDING` (some checks still running), `FAIL` (≥1 check failed/cancelled), `PASS`
  (all finished and green), or `NONE`.
- When `CI=FAIL`, a `FAILED_CHECKS_BEGIN … FAILED_CHECKS_END` block lists each failing check as
  `name<TAB>bucket<TAB>link` — capture these to hand to the fixer.

If the script can't resolve the PR or find CI logs, ask the user for the PR number / CI URL /
CI password rather than guessing.

### Step 2 — Decide and act on the snapshot

Pick exactly one branch based on the snapshot, in this priority order:

**A. CI still `PENDING`** → do nothing this round. Go to Step 3 and reschedule.

**B. CI `FAIL`** → before dispatching, run two guards against the state file:

- **Stale-CI guard.** If the failing run is for an *older* commit than the current `origin/<head>`
  tip (compare the run's head SHA — from the check's run, or just `git rev-parse origin/<head>`
  against `lastHeadSha`), a previous fixer's push has not re-triggered CI yet. Treat this as
  `PENDING` (case A): do nothing, reschedule. This prevents dispatching a second fixer for a
  failure that is already being re-tested.
- **Give-up guard.** For each currently-failing check, look at `fixAttempts[<check name>]`. If a
  check has already had **2** fix attempts and is still failing on a *newer* head SHA than when it
  was last attempted, the loop is not making progress on it — **stop and escalate** (see "Giving
  up").

Otherwise dispatch a **new fixer agent** (see "Dispatching the fixer" below). After it pushes,
increment `fixAttempts[<check name>]` for each check it addressed and set `lastHeadSha` to the new
`origin/<head>` tip. Wait for it to finish (it commits as new commits and pushes, which restarts
CI), then go to Step 3. Do not also fix in this session — the fixer owns the edits.

**C. Conflicts present** (`MERGEABLE=CONFLICTING` or `MERGE_STATE=DIRTY`), CI not failing →
resolve them yourself the way `/rebase-pr` does, choosing rebase vs. merge by the rule below, then
push and go to Step 3.

**D. CI `PASS` and no conflicts** → **stop.** Do not reschedule. Report success (Step 4).

If both CI failed *and* conflicts exist, handle the conflicts first (B-style fixes won't land
cleanly on a conflicted branch), then let the next iteration pick up the CI failures.

### Dispatching the fixer (case B)

Spawn one agent (Task / Agent tool) to fix the failures. It must receive **full context** so it
never has to rediscover the failures:

- PR number, head branch, base branch.
- Each failing check: its **name**, **bucket**, and **log link/hash** from the `FAILED_CHECKS`
  block.
- The repro command for affected tests, and the instruction to pull logs the way `/fix-pr` does
  (via the `identify-ci-failures` subagent) and root-cause real test failures — prefer a genuine
  fix over a skip/flake flag; only re-run a job when a failure is clearly infra/flaky.

Bake these instructions into the fixer's prompt:
- Check out the PR branch, verify locally (`yarn build` + affected tests) before pushing.
- **Commit fixes as NEW commits — never `--amend`.** Stage named files only. Conventional-commit
  message, no Claude co-author trailer. Then `git push` (plain push; no force needed for new
  commits).
- Report back what it changed and whether the push succeeded.

### Resolving conflicts (case C) — rebase vs. merge

Default to **rebase**, matching `/rebase-pr`. The one exception: if `HAS_BASE_MERGE_COMMITS=yes`,
the branch already merged the base in, so **merge** the base instead (rebasing a branch with merge
commits is error-prone and would rewrite that history).

```bash
git fetch origin <base>
gh pr checkout <PR>          # if not already on the branch
```

- **Rebase path** (`HAS_BASE_MERGE_COMMITS=no`):
  `git rebase origin/<base>` → resolve each conflict, `git add <named-files>`,
  `git rebase --continue`, repeat → verify (`yarn build`; bootstrap first if there are changes
  outside `yarn-project`, as `/rebase-pr` describes) → `git push --force-with-lease`.
- **Merge path** (`HAS_BASE_MERGE_COMMITS=yes`):
  `git merge origin/<base>` → resolve each conflict, `git add <named-files>`,
  `git commit` (a new merge commit; never amend) → verify → `git push` (plain push).

Either way: stage named files only, and never amend existing commits.

### Giving up (stop without success)

The loop is meant to be unattended, so it must recognize when it is stuck and hand back to the human
rather than spinning. **Stop and report (do NOT reschedule)** when any of these hold:

- **Per-check stall.** A failing check has reached **2** fix attempts (`fixAttempts[<name>] >= 2`)
  and still fails on a newer head SHA than the last attempt — the fixer cannot resolve it.
- **Global cap.** `iterations` reaches **12** (~2 hours at the 10-minute cadence) without reaching
  green-and-conflict-free.

When giving up, report like Step 4 but framed as *unresolved*: PR number, what is still failing (the
stuck check names + their log links) or still conflicting, how many iterations/fix attempts were
spent, and a one-line ask for the human to take over. Then **omit `ScheduleWakeup`** and `TaskStop`
any Monitor you armed. Do not delete the state file — it is the record of what was tried.

### Step 3 — Reschedule (the ~10-minute loop)

This skill self-paces using the same dynamic-loop contract as the `loop` skill. As the **last
action of the turn** (after writing a one-line status of what you observed and did):

0. **Persist the state file** (`monitor-pr-<PR>.json`) with this iteration's updated `iterations`,
   `lastHeadSha`, and `fixAttempts` — otherwise the next cold turn cannot tell whether progress is
   being made and the give-up guards never fire.
1. Optionally arm a **Monitor** (`persistent: true`) as the primary wake signal — e.g. poll
   `gh pr checks <PR>` and emit a line when any check leaves `pending`, or when the run finishes.
   Arm it once; on later iterations call `TaskList` first and skip if it's already running. With a
   Monitor armed, `ScheduleWakeup` becomes a fallback heartbeat rather than the only trigger.
2. Call **`ScheduleWakeup`** with:
   - `delaySeconds: 600` (~10 minutes; lean longer, 1200–1800s, if a Monitor is the real trigger).
   - `reason`: one sentence on why (e.g. "next CI poll for PR #N").
   - `prompt: "/monitor-pr <PR>"` — verbatim, so the next firing re-enters this skill and continues
     the loop.

If woken by a `<task-notification>` from the Monitor instead of the scheduled prompt, handle the
event (re-run Step 1–2 for that PR), then call `ScheduleWakeup` again with the same prompt and delay
to reset the safety net.

### Step 4 — Stop and report (case D)

When the PR is green and conflict-free:
- **Omit the `ScheduleWakeup` call** (this ends the loop) and `TaskStop` any Monitor you armed
  (use `TaskList` to find its ID if it's no longer in context).
- Report: PR number, final CI status (all checks green), that there are no conflicts, and a short
  summary of anything the loop fixed or merged along the way.

## Key Points

- **Loop until green AND conflict-free**, then stop — green alone is not done if the PR still
  conflicts, and vice versa.
- **Bounded — give up when stuck.** Persist `monitor-pr-<PR>.json` across cold turns; stop and
  escalate after 2 failed fix attempts on the same check or 12 iterations. Never loop forever.
- **Self-pace via `ScheduleWakeup`** every ~10 min (`prompt: /monitor-pr <PR>`); a `persistent`
  Monitor on `gh pr checks` is the idiomatic faster wake signal. Stopping = simply not rescheduling.
- **New commits only, never amend** — for both the dispatched fixer and your own conflict commits.
- **Fixer gets full context** — PR/branches/base, every failing check name + log link, repro
  command — so it never re-investigates from scratch.
- **Rebase by default; merge when the branch already merged the base** (`HAS_BASE_MERGE_COMMITS=yes`).
- **Base comes from the PR, not assumptions.** Named `git add` only. Conventional commits, no Claude
  trailer.

## Reference

- `check-pr.sh` (this directory) — the status-snapshot script.
- `/fix-pr` — CI-failure identification and fixing methodology.
- `/rebase-pr` — conflict resolution and post-rebase verification.
- `CLAUDE.md` — base-branch routing and repo guardrails.
