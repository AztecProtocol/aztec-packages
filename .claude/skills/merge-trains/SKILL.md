---
name: merge-trains
description: Understand and assist with merge-train workflows including creating PRs, debugging failures, managing labels, and bypassing checks when needed.
---

# Merge Trains

## What Is a Merge Train?

A merge train is an automated batching system (inspired by [Rust rollups](https://forge.rust-lang.org/release/rollups.html)) that groups multiple PRs together for coordinated integration into the `next` branch. Instead of each PR going through the merge queue individually, teams push their PRs into a shared `merge-train/*` branch. Periodically, that branch is merged as a single unit into `next`.

## Active Merge-Train Branches

| Branch | Team / Domain | Slack Channel |
|---|---|---|
| `merge-train/avm` | AVM / VM2 | `#team-bonobos` |
| `merge-train/barretenberg` | Barretenberg / Honk | `#honk-team` |
| `merge-train/ci` | CI infrastructure | `#help-ci` |
| `merge-train/docs` | Documentation | `#dev-rels` |
| `merge-train/spartan` | Spartan / infra | `#team-alpha` |

These are defined in `.github/workflows/merge-train-next-to-branches.yml`.

## How to Use a Merge Train

### Targeting a Merge Train with Your PR

1. Create your feature branch **off the appropriate merge-train branch** (not `master` or `next`).
2. Open your PR targeting that merge-train branch (e.g., base: `merge-train/barretenberg`).
3. When your PR is approved and merged, it gets squashed into the merge-train branch.
4. The merge-train PR (which targets `next`) automatically accumulates your commit.

### Key Rules for Contributors

- **Base branch matters**: Always branch from and target the correct `merge-train/*` branch. For barretenberg work, use `merge-train/barretenberg`. For AVM work, use `merge-train/avm`. See `barretenberg/CLAUDE.md` and `barretenberg/cpp/src/barretenberg/vm2/CLAUDE.md`.
- **Your PR is squashed into the train**: Individual PRs targeting a merge-train branch are squash-merged as usual.
- **The train itself is NOT squashed**: The merge-train PR (e.g., `merge-train/barretenberg` -> `next`) is merged with a **merge commit**, preserving the individual squashed commits. This is why the `ci-no-squash` label is automatically applied.
- **You don't need to worry about the train PR itself** -- it is fully automated (creation, body updates, approval, merge, and recreation).

## Labels

| Label | Meaning | Applied To |
|---|---|---|
| `ci-no-squash` | Exempts from the single-commit squash check. **Automatically applied** to all merge-train PRs. | Merge-train PRs targeting `next` |
| `ci-full-no-test-cache` | Forces full CI without test caching. **Automatically applied** to `merge-train/spartan` PRs. | `merge-train/spartan` PRs |
| `ci-skip` | Skips CI entirely. Use when you need to force-merge a train without waiting for CI. | Any PR (apply manually) |
| `ci-merge-queue` | Simulates merge-queue CI mode on a regular PR push. | Any PR (apply manually) |
| `ci-docs` | Triggers docs-only CI. Automatically used when target is `merge-train/docs`. | PRs targeting `merge-train/docs` |
| `ci-barretenberg` | Triggers barretenberg-only CI. Automatically used when target is `merge-train/barretenberg`. | PRs targeting `merge-train/barretenberg` |
| `ci-no-fail-fast` | Continues running all CI tests even if some fail. | Any PR (apply manually) |

## Automation Lifecycle

The merge-train system is fully automated via GitHub Actions in `.github/workflows/merge-train-*.yml`:

1. **PR Creation** (`merge-train-create-pr.yml`): When code is pushed to a `merge-train/*` branch, a PR targeting `next` is automatically created with the `ci-no-squash` label (and `ci-full-no-test-cache` for spartan).

2. **Body Updates** (`merge-train-update-pr-body.yml`): On every push, the PR body is updated with a list of meaningful commits (those containing PR references like `(#1234)`). The body uses `BEGIN_COMMIT_OVERRIDE` / `END_COMMIT_OVERRIDE` markers.

3. **Next Integration** (`merge-train-next-to-branches.yml`): Whenever code is pushed to `next`, it is automatically merged into all active merge-train branches. If there are merge conflicts, a comment is posted on the latest `next` commit. This keeps trains up-to-date with `next`.

4. **Auto-Merge** (`merge-train-auto-merge.yml`): An hourly cron job checks all merge-train PRs. If a train has been **inactive for 4+ hours** (no new meaningful, non-merge commits) and the last merge-queue run didn't fail, it is automatically approved and merged. A bot comment is posted: "Auto-merge enabled after 4 hours of inactivity."

5. **Recreation** (`merge-train-recreate.yml`): After a merge-train PR merges, the branch is recreated from `next` with an empty commit, starting a new cycle.

6. **Failure Notification** (`merge-queue-dequeue-notify.yml`): If a merge-train PR is dequeued from the merge queue without being merged (CI failure), a Slack notification is sent to the team's channel.

## CI Behavior for Merge Trains

- **Specialized CI modes**: PRs targeting `merge-train/docs` run docs-only CI. PRs targeting `merge-train/barretenberg` run barretenberg-only CI. This avoids running the full test suite for domain-specific changes.
- **Merge-queue mode**: When the merge-train PR enters GitHub's merge queue, it runs the full `merge-queue` CI mode (4 parallel grind runs on AMD64 + 1 ARM64). `merge-train/spartan` uses the heavier `merge-queue-heavy` mode (10 grind runs).
- **Full concurrency**: Merge-train PRs get unique CI concurrency groups (using `github.run_id`), so multiple CI runs can proceed in parallel without cancelling each other.
- **Test history tracking**: Test results are tracked for merge-train PRs, same as merge-queue runs.

## Handling Merge-Train Failures

### When CI Fails on the Merge-Train PR

Two options from the [merge-train-readme.md](https://github.com/AztecProtocol/aztec-packages/blob/next/.github/workflows/merge-train-readme.md):

**Option 1: Direct Fix** -- Push a fix directly to the merge-train branch. Use bypass merge to expedite (all users have this permission).

**Option 2: Fix in Next** -- Merge a revert or workaround into `next`. The fix will auto-propagate to the merge-train via the `merge-train-next-to-branches` workflow. Best when the root cause is in `next` or multiple trains are affected.

### When Auto-Merge Is Blocked

The auto-merge script will **not** enable auto-merge if the last merge-queue CI run for the PR concluded with `failure` or `cancelled`. Someone needs to either fix the issue and push, or force-merge.

### Merge Conflicts from Next

When merging `next` into a train branch causes conflicts, the `merge-next.sh` script:
- Aborts the merge
- Posts a comment on the latest `next` commit listing the conflicted files
- The team must manually resolve conflicts on their train branch

## Bypassing Checks / Force-Merging

If the user needs to bypass CI checks for their merge-train PR (e.g., a known flaky failure, an urgent merge, or CI infrastructure issues):

1. **Confirm intent**: Always confirm with the user that they want to skip CI, since this merges untested code into `next`.
2. **Add the `ci-skip` label**: Apply the `ci-skip` label to the merge-train PR. This causes CI to skip entirely. Use: `gh pr edit <PR_NUMBER> --add-label ci-skip`
3. **Force merge in the UI**: The user can then use GitHub's "Merge without waiting for requirements to be met" button (bypass merge) in the PR UI. All users have this permission. This cannot be done via the CLI -- it must be done through the GitHub web UI.

**Important**: Only do this when the user explicitly asks to bypass checks. Always confirm first since it skips all CI validation.

## Backport Trains

A related system exists for backport branches (`backport-to-*`). These use the same `auto-merge.sh` script but with different settings:
- Branch pattern: `backport-to-`
- Inactivity threshold: 8 hours (instead of 4)
- Merge strategy: merge commit

## Key Files Reference

| File | Purpose |
|---|---|
| `.github/workflows/merge-train-readme.md` | User-facing documentation |
| `.github/workflows/merge-train-create-pr.yml` | Auto-creates PRs for train branches |
| `.github/workflows/merge-train-auto-merge.yml` | Hourly cron to auto-merge inactive trains |
| `.github/workflows/merge-train-next-to-branches.yml` | Syncs `next` into all train branches |
| `.github/workflows/merge-train-recreate.yml` | Recreates branch after merge |
| `.github/workflows/merge-train-update-pr-body.yml` | Updates PR body with commit list |
| `.github/workflows/merge-queue-dequeue-notify.yml` | Slack notification on merge-queue failure |
| `scripts/merge-train/auto-merge.sh` | Auto-merge logic |
| `scripts/merge-train/merge-next.sh` | Merge `next` into train branch |
| `scripts/merge-train/update-pr-body.sh` | Update PR body with commits |
| `ci3/merge_train_failure_slack_notify` | Slack failure notification |
| `.github/ci3_labels_to_env.sh` | CI mode selection based on labels/branches |
| `.github/workflows/squashed-pr-check.yml` | Squash enforcement (skipped for `ci-no-squash`) |
