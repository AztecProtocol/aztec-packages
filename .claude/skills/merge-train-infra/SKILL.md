---
name: merge-train-infra
description: Reference for merge-train automation internals -- workflows, scripts, CI integration, and configuration. Use when modifying or debugging merge-train infrastructure.
---

# Merge-Train Infrastructure

This skill covers the automation internals of the merge-train system. For contributor-facing guidance (creating PRs, labels, handling failures), see the `merge-trains` skill.

## Automation Lifecycle

The merge-train system is fully automated via GitHub Actions in `.github/workflows/merge-train-*.yml`:

1. **PR Creation** (`merge-train-create-pr.yml`): Triggered on push to `merge-train/*` branches. Creates a PR targeting `main` (or `v<N>-next` for `-v<N>` trains, e.g. a future `merge-train/spartan-v6` → `v6-next`) with the `ci-no-squash` label (plus `ci-full-no-test-cache` for `merge-train/spartan` and `merge-train/ci`). Skips merge commits and commits already in the base branch.

2. **Body Updates** (`merge-train-update-pr-body.yml`): Triggered on push to `merge-train/**`, `backport-to-*-staging`, and `port-to-main-staging` branches. Updates the PR body with meaningful commits (those containing PR references like `(#1234)`). The body wraps the commit list in `BEGIN_COMMIT_OVERRIDE` / `END_COMMIT_OVERRIDE` markers. Backport/port staging PRs also call `update-pr-body.sh` inline from `scripts/backport_to_staging.sh` to handle the first-push case (where the PR doesn't exist yet when the workflow fires).

3. **Main Integration** (`merge-train-next-to-branches.yml`): Triggered on push to `main`; merges `main` into each train via `scripts/merge-train/merge-next.sh`, which takes an optional second argument for the source branch (defaults to `main`). Uses `continue-on-error: true` so a conflict in one branch does not block others. Skips branches whose PR already has auto-merge enabled.

4. **Auto-Merge** (`merge-train-auto-merge.yml`): Runs hourly via cron (`0 * * * *`). Calls `scripts/merge-train/auto-merge.sh` for merge-train (4-hour inactivity), backport-train (`BRANCH_PATTERN=backport-to-`, 8-hour), and port-to-main (`BRANCH_PATTERN=port-to-main`, 8-hour) branches. Uses separate GitHub tokens: `AZTEC_BOT_GITHUB_TOKEN` for API calls and `MERGE_TRAIN_GITHUB_TOKEN` for approvals. Will not auto-merge if the last merge-queue CI run failed or was cancelled.

5. **Recreation & Wakeup** (`merge-train-recreate.yml`): Triggered when a PR is closed (merged). If the merged PR's head branch starts with `merge-train/`, recreates the branch from the base branch (usually `main`). Then runs `scripts/merge-train/wakeup-prs.sh` to add the `ci-wakeup-pr-after-merge` label to all open PRs targeting the branch that have passed CI and have automerge enabled. This triggers a CI re-run (typically a no-op via tree-hash cache) so those PRs can proceed through the merge queue. The label is immediately removed by a step in `ci3.yml` so it can be re-applied on subsequent merges.

6. **Failure Notification** (`merge-queue-dequeue-notify.yml`): Triggered when a PR is dequeued from the merge queue. If the PR's head branch starts with `merge-train/` and the PR was NOT merged, sends a Slack notification via `ci3/merge_train_failure_slack_notify`. That script also kicks off a ClaudeBox session to investigate/fix the dequeued PR (`ci3/slack_notify_with_claudebox_kickoff`), passing `--repo "$GITHUB_REPOSITORY"` so the session runs in the mode matching the repo the train lives on. When the train is on a private mirror (`…-private`), `claudebox.yml` selects private mode; otherwise it stays public. Without that repo hint a private-train fix session lands in public mode and cannot read the PR or open the fix.

## Label-Driven Ports (`backport.yml`)

`backport.yml` (triggered on `pull_request_target` labeled/closed) cherry-picks a merged PR onto an accumulating staging branch, then opens/updates one staging PR into a target branch. It handles two label families, both driven by `scripts/backport_to_staging.sh`:

- **`backport-to-<branch>`** (e.g. `backport-to-v6-next`): target is `<branch>` (derived from the label), staging branch `backport-to-<branch>-staging`. Direction `main` → release line.
- **`port-to-main`** (fixed, generic): target is `main`, staging branch `port-to-main-staging`. Direction: forward-port an already-merged PR straight into `main`. The workflow passes `STAGING_BRANCH` / `STAGING_PR_TITLE` / `STAGING_PR_LABELS` env overrides into the script; the staging PR carries `ci-no-squash` (required because `main` enforces squashed PRs). `port-to-main` takes precedence if both label families are present.

On cherry-pick conflict the workflow comments on the PR, posts to `#backports`, and dispatches ClaudeBox (`.claude/claudebox/backport.md`) with the staging branch to resolve manually. Staging PRs are auto-merged by the 8-hour jobs in `merge-train-auto-merge.yml`.

## Bulk Forward-Port (`scripts/port_to_main.sh`)

A bulk sweep (distinct from the per-PR `port-to-main` label) that feeds `main` with everything on a release line (e.g. a future `v6-next`). Run manually as `scripts/port_to_main.sh <source_branch>`; the workflow that scheduled it daily was retired with the v5 line. The `port-<source>-to-main` branch is long-lived: each run checks it out and merges both `main` and the source into it, then opens/updates one `ci-no-squash` PR into `main`. Accumulating (rather than rebuilding) means any conflict resolution pushed to the branch is preserved across runs. Once the PR is merged (the branch becomes an ancestor of `main`) the next run rebuilds the branch fresh from `main` with a `--force-with-lease` push; while accumulating it fast-forwards. If a run produces no delta over `main` it closes the stale PR. A merge conflict does **not** abandon the run: the conflicted merge is committed with markers (so the PR is still opened/updated as a resolution target) and the script emits `conflicts` / `pr_url` step outputs. Resolve by checking out the port branch, fixing the markers, and pushing. This PR is intentionally left for human review — it is not added to the auto-merge patterns.

## CI Integration Details

### CI Mode Selection (`.github/ci3_labels_to_env.sh`)

Merge-train branches influence CI mode:
- `merge_group` events or `ci-merge-queue` label → `merge-queue` mode
- Target branch `merge-train/docs` → `ci-docs` mode

### CI Concurrency (`.github/workflows/ci3.yml`)

```yaml
group: ci3-${{ (startsWith(github.event.pull_request.head.ref, 'merge-train/') && github.run_id) || ... }}
```

Merge-train PRs get **full concurrency** (each run has its own unique group via `github.run_id`), while non-merge-train PRs share a group by branch name with cancel-in-progress.

### Instance Postfix (`.github/ci3.sh`)

```bash
if [[ "${PR_HEAD_REF:-}" == merge-train/* ]]; then
    export INSTANCE_POSTFIX=${PR_COMMITS:-}
fi
```

Merge-train PRs get a unique instance postfix (commit count) to allow parallel EC2 instances.

### CI Modes in bootstrap.sh

- `ci-docs`: Only builds and tests documentation
- `merge-queue`: 4x AMD64 full + 1x ARM64 fast in parallel
- `merge-queue-heavy`: 10x AMD64 full + 1x ARM64 fast in parallel (no train currently triggers it automatically)

### Test History Tracking (`ci3/run_test_cmd`)

```bash
if [[ "$is_merge_queue" -eq 1 || ("${TARGET_BRANCH:-}" =~ ^v[0-9]) || ("${TARGET_BRANCH:-}" == merge-train/*) ]]; then
    track_test_history=1
fi
```

### Failure Notification (`ci3/bootstrap_ec2`)

When a CI run fails on an EC2 instance, it calls `merge_train_failure_slack_notify` to send failure notifications to the appropriate Slack channel based on the branch name.

## Creating a New Merge Train

1. Create a branch from the desired base (`main` for most trains; a release line like `v6-next` for a release-specific train) with naming pattern `merge-train/{team}`. For a release-line train use the `-v<N>` suffix (`merge-train/{team}-v6`): `merge-train-create-pr.yml` routes any `*-v<N>` branch to a `v<N>-next` base automatically.
2. Add the branch to the loop in `.github/workflows/merge-train-next-to-branches.yml`. If it tracks a base branch other than `main`, also add that base to the workflow's `push` trigger and pass it as the second argument to `merge-next.sh`
3. For a base other than `main` that the `-v<N>` convention does not already cover, set the PR base in `.github/workflows/merge-train-create-pr.yml`. Either way, add a stale-check job that passes `BASE_BRANCH` in `.github/workflows/merge-train-stale-check.yml`
4. Add the branch-to-Slack-channel mapping in `ci3/merge_train_failure_slack_notify`
5. Optionally add CI mode overrides in `.github/ci3_labels_to_env.sh` and `bootstrap.sh`
6. Push code to the branch -- automation handles PR creation from there

## Key Files Reference

### Workflows

| File | Purpose |
|---|---|
| `.github/workflows/merge-train-readme.md` | User-facing documentation |
| `.github/workflows/merge-train-create-pr.yml` | Auto-creates PRs for train branches |
| `.github/workflows/merge-train-auto-merge.yml` | Hourly cron to auto-merge inactive trains |
| `.github/workflows/merge-train-next-to-branches.yml` | Syncs `main` into all train branches; defines active branches |
| `.github/workflows/merge-train-recreate.yml` | Recreates branch after merge |
| `.github/workflows/merge-train-update-pr-body.yml` | Updates PR body with commit list (merge-train and backport branches) |
| `.github/workflows/merge-queue-dequeue-notify.yml` | Slack notification on merge-queue dequeue |
| `.github/workflows/squashed-pr-check.yml` | Squash enforcement (skipped for `ci-no-squash`) |
| `.github/workflows/backport.yml` | Cherry-picks merged PRs to staging branches for `backport-to-*` and `port-to-main` labels |

### Scripts

| File | Purpose |
|---|---|
| `scripts/merge-train/auto-merge.sh` | Auto-merge logic -- checks inactivity, last CI status, approves and merges |
| `scripts/merge-train/merge-next.sh` | Merges `main` into a train branch, handles conflicts, cancels stale CI runs |
| `scripts/merge-train/update-pr-body.sh` | Updates PR body with meaningful commits |
| `scripts/merge-train/squash-pr.sh` | Squashes PR commits (used by `ci-squash-and-merge` label) |
| `scripts/merge-train/wakeup-prs.sh` | Adds `ci-wakeup-pr-after-merge` label to qualifying PRs after branch recreation |
| `scripts/backport_to_staging.sh` | Cherry-picks a merged PR to a backport staging branch; creates/updates the backport PR |
| `scripts/port_to_main.sh` | Bulk forward-port (manual): accumulates `main` + source onto long-lived `port-<source>-to-main`, opens/updates the PR |

### CI Configuration

| File | Purpose |
|---|---|
| `.github/ci3_labels_to_env.sh` | CI mode selection based on labels and target branches |
| `.github/ci3.sh` | Instance postfix for merge-train parallelism |
| `ci3/merge_train_failure_slack_notify` | Slack failure notification with branch-to-channel mapping |
| `ci3/run_test_cmd` | Test history tracking for merge-train branches |
| `ci3/bootstrap_ec2` | EC2 failure notification trigger |
| `bootstrap.sh` | CI mode definitions (`ci-docs`, `ci-full`, etc.) |

### Other Scripts

| File | Purpose |
|---|---|
| `scripts/auto_close_issues.py` | Auto-closes issues referenced in merged merge-train PRs (GitHub's native auto-close doesn't work for intermediate branches) |
| `scripts/find_orphaned_issues_in_prs.py` | Finds PRs in merge-train commits that reference still-open issues |
| `scripts/dedupe_release_notes.py` | Deduplicates release notes from merge-train merges |
| `scripts/commits` | Pretty git log that groups merge-train children by subsystem |
| `scripts/filter_history` | Filters git history, identifying merge-train merge commits as "containers" |
