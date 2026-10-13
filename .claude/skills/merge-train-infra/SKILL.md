---
name: merge-train-infra
description: Reference for merge-train automation internals -- workflows, scripts, CI integration, and configuration. Use when modifying or debugging merge-train infrastructure.
---

# Merge-Train Infrastructure

This skill covers the automation internals of the merge-train system. For contributor-facing guidance (creating PRs, labels, handling failures), see the `merge-trains` skill. Cite the files below as the source of truth; this page states their behaviour in one line each.

## Trains the auto-pull syncs

The loop in `.github/workflows/merge-train-next-to-branches.yml` defines which trains this repo keeps in sync with `next`: `merge-train/avm`, `merge-train/barretenberg` and `merge-train/ci`. A push to `v5-next` syncs nothing (the workflow prints "No merge trains track v5-next any more").

Other `merge-train/*` branches still exist on the remote (`docs`, `fairies`, `fairies-v5`, `spartan`, `spartan-v5`, `spartan-v6`). `merge-train-create-pr.yml`, `.github/ci3_labels_to_env.sh` and `ci3/merge_train_failure_slack_notify` still special-case some of them, but the auto-pull does not sync them. Their code lives in aztec-node.

No train in the auto-pull loop targets the `v6` release line.

## Automation Lifecycle

The merge-train system is automated via GitHub Actions in `.github/workflows/merge-train-*.yml`:

1. **PR Creation** (`merge-train-create-pr.yml`): Triggered on push to `merge-train/*` branches. Creates a PR targeting `next`. A branch with a `-v<N>` suffix targets `v<N>-next` instead (regex `-v([0-9]+)$`), so `merge-train/spartan-v5` targets `v5-next`. `merge-train/spartan-v6` would get `v6-next`, which does not exist on this remote; the release-line branch is `v6`. Every PR gets the `ci-no-squash` label. Trains that target a `v<N>-next` line also get `private-port-next`. `merge-train/spartan`, `merge-train/spartan-v5` and `merge-train/ci` also get `ci-full-no-test-cache`. Skips merge commits without a PR reference and commits already in the base branch.

2. **Body Updates** (`merge-train-update-pr-body.yml`): Triggered on push to `merge-train/**` branches. Updates the PR body with meaningful commits (those containing PR references like `(#1234)`). The body wraps the commit list in `BEGIN_COMMIT_OVERRIDE` / `END_COMMIT_OVERRIDE` markers.

3. **Next Integration** (`merge-train-next-to-branches.yml`): Triggered on push to `next` and `v5-next`. A push to `next` runs `scripts/merge-train/merge-next.sh` for each train in the loop. Each call ends in `|| true`, so a conflict in one branch does not block the others. `merge-next.sh` takes an optional second argument for the source branch (defaults to `next`) and skips branches whose PR already has auto-merge enabled.

4. **Auto-Merge** (`merge-train-auto-merge.yml`): Runs hourly via cron (`0 * * * *`). Calls `scripts/merge-train/auto-merge.sh` for merge-train branches. A train merges after 4 hours of inactivity (`INACTIVITY_HOURS`, default 4). Uses separate GitHub tokens: `AZTEC_BOT_GITHUB_TOKEN` for API calls and `MERGE_TRAIN_GITHUB_TOKEN` for approvals. Will not auto-merge if the last merge-queue CI run failed or was cancelled.

5. **Recreation & Wakeup** (`merge-train-recreate.yml`): Triggered when a PR is closed (merged). If the merged PR's head branch starts with `merge-train/`, recreates the branch from the base branch (usually `next`). Then runs `scripts/merge-train/wakeup-prs.sh` to add the `ci-wakeup-pr-after-merge` label to all open PRs targeting the branch that have passed CI and have automerge enabled. This triggers a CI re-run (typically a no-op via tree-hash cache) so those PRs can proceed through the merge queue. A step in `ci3.yml` removes the label immediately so it can be re-applied on subsequent merges.

6. **Failure Notification** (`merge-queue-dequeue-notify.yml`): Triggered when a PR is dequeued from the merge queue. If the PR's head branch starts with `merge-train/` and the PR was NOT merged, sends a Slack notification via `ci3/merge_train_failure_slack_notify`.

The `ci-no-squash` label is set on every train PR but nothing reads it. `ci3/merge_train_stale_check` exists, but no workflow calls it.

## Release-Line Ports

Ports between release lines are not automated in this repo. A PR labelled `port-to-<branch>` (for example `port-to-v6` or `port-to-next`) is ported by ClaudeBox, which watches merged PRs through the GitHub webhook; see the root `CLAUDE.md`. The labs half of the tree lives in aztec-node, so `mark-v5-port-candidates.yml` labels PRs against `v5`/`v5-next` with `port-to-aztec-node` for a person to port there.

## Public-to-private sync

These run only in `AztecProtocol/aztec-packages-private`:

- `sync-upstream-next.yml` / `sync-upstream-v5-next.yml`: mirror upstream `aztec-packages:next` (or `v5-next`) onto `public-next` (or `public-v5-next`) with `scripts/merge-train/sync-public-next.sh` (a hard reset), then merge it into the private base with `scripts/merge-train/merge-public-next.sh`.
- `public-next-pr-body.yml` / `public-v5-next-pr-body.yml`: keep the body of the `next` → `public-next` PR current with `scripts/merge-train/update-public-next-pr-body.sh`.

## CI Integration Details

### CI Mode Selection (`.github/ci3_labels_to_env.sh`)

- `merge_group` events or the `ci-merge-queue` label → `merge-queue` mode.
- A `merge_group` event for `merge-train/spartan-v5` → `merge-queue-heavy`.
- A `merge_group` event for `merge-train/ci` → `merge-queue-ci`.
- Target branch `merge-train/barretenberg`, or the `ci-barretenberg` label → `barretenberg` mode.

### CI Modes (`ci.sh`)

- `merge-queue`: 1x AMD64 full (`x1-full`) + 1x ARM64 fast (`a1-fast`) in parallel (`ci.sh:229-234`).
- `merge-queue-heavy`: 10x AMD64 full + 1x ARM64 fast (used for `merge-train/spartan-v5`).
- `merge-queue-ci`: 10x AMD64 full + 1x ARM64 fast + a dry-run release, with `NO_CACHE=1` (used for `merge-train/ci`).
- `barretenberg`: runs `./bootstrap.sh ci-barretenberg`, which builds and tests only barretenberg with AVM disabled. `barretenberg-full` adds acir_tests.

### CI Concurrency (`.github/workflows/ci3.yml`)

Merge-train PRs key the concurrency group on the head SHA. Runs for different commits proceed in parallel; a duplicate run for the same SHA cancels the older one (`cancel-in-progress: true`). Other PRs share one group per branch.

### Instance Postfix (`.github/ci3.sh`)

Merge-train PRs set `INSTANCE_POSTFIX` to the PR's commit count (`PR_COMMITS`), so parallel runs get distinct EC2 instances.

### Test History Tracking (`ci3/run_test_cmd`)

Test results are recorded in the history tracker for merge-queue runs and for runs targeting a version branch (`v[0-9]*`) or a `merge-train/*` branch (`ci3/run_test_cmd:47-48`).

### Failure Notification (`ci3/bootstrap_ec2`)

When a CI run fails on an EC2 instance, it calls `merge_train_failure_slack_notify` to send failure notifications to the appropriate Slack channel based on the branch name.

## Creating a New Merge Train

1. Create a branch from the desired base (`next` for most trains) with naming pattern `merge-train/{team}`. A `-v<N>` suffix makes `merge-train-create-pr.yml` target `v<N>-next` and add the `private-port-next` label; check that the base branch exists first.
2. Add the branch to the loop in `.github/workflows/merge-train-next-to-branches.yml`. If it tracks a base branch other than `next`, also add that base to the workflow's `push` trigger and pass it as the second argument to `merge-next.sh`.
3. For a base other than `next` that the `-v<N>` rule does not cover, set the PR base in `.github/workflows/merge-train-create-pr.yml`.
4. Add the branch-to-Slack-channel mapping in `ci3/merge_train_failure_slack_notify`.
5. Optionally add CI mode overrides in `.github/ci3_labels_to_env.sh` and `ci.sh`.
6. Push code to the branch -- automation handles PR creation from there.

## Key Files Reference

### Workflows

| File | Purpose |
|---|---|
| `.github/workflows/merge-train-readme.md` | User-facing documentation |
| `.github/workflows/merge-train-create-pr.yml` | Auto-creates PRs for train branches |
| `.github/workflows/merge-train-auto-merge.yml` | Hourly cron to auto-merge inactive trains |
| `.github/workflows/merge-train-next-to-branches.yml` | Syncs `next` into the train branches; defines which trains are synced |
| `.github/workflows/merge-train-recreate.yml` | Recreates branch after merge |
| `.github/workflows/merge-train-update-pr-body.yml` | Updates PR body with commit list (merge-train branches) |
| `.github/workflows/merge-queue-dequeue-notify.yml` | Slack notification on merge-queue dequeue |
| `.github/workflows/sync-upstream-{next,v5-next}.yml` | Private repo only: mirror and merge the public branch |
| `.github/workflows/public-{next,v5-next}-pr-body.yml` | Private repo only: update the public-sync PR body |

### Scripts

| File | Purpose |
|---|---|
| `scripts/merge-train/auto-merge.sh` | Auto-merge logic -- checks inactivity, last CI status, approves and merges |
| `scripts/merge-train/merge-next.sh` | Merges `next` into a train branch, handles conflicts, cancels stale CI runs |
| `scripts/merge-train/update-pr-body.sh` | Updates PR body with meaningful commits |
| `scripts/merge-train/squash-pr.sh` | Squashes PR commits (used by `ci-squash-and-merge` label) |
| `scripts/merge-train/squash-pr.test.sh` | Offline end-to-end test for `squash-pr.sh` |
| `scripts/merge-train/wakeup-prs.sh` | Adds `ci-wakeup-pr-after-merge` label to qualifying PRs after branch recreation |
| `scripts/merge-train/sync-public-next.sh` | Hard-resets the public mirror branch to upstream |
| `scripts/merge-train/merge-public-next.sh` | Merges the public mirror branch into the private base |
| `scripts/merge-train/update-public-next-pr-body.sh` | Updates the public-sync PR body |

### CI Configuration

| File | Purpose |
|---|---|
| `.github/ci3_labels_to_env.sh` | CI mode selection based on labels and target branches |
| `.github/ci3.sh` | Instance postfix for merge-train parallelism |
| `ci.sh` | Instance fan-out per CI mode (`merge-queue`, `merge-queue-heavy`, `merge-queue-ci`) |
| `ci3/merge_train_failure_slack_notify` | Slack failure notification with branch-to-channel mapping |
| `ci3/run_test_cmd` | Test history tracking for merge-train branches |
| `ci3/bootstrap_ec2` | EC2 failure notification trigger |
| `bootstrap.sh` | CI target definitions (`ci-barretenberg`, `ci-full`, etc.) |

### Other Scripts

| File | Purpose |
|---|---|
| `scripts/find_orphaned_issues_in_prs.py` | Finds PRs in merge-train commits that reference still-open issues |
| `scripts/dedupe_release_notes.py` | Deduplicates release notes from merge-train merges |
| `scripts/commits` | Pretty git log that groups merge-train children by subsystem |
| `scripts/filter_history` | Filters git history, identifying merge-train merge commits as "containers" |
