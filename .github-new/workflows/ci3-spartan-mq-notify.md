# Proposal: Notify #team-alpha on merge-train/spartan merge-queue failures

This change could not be applied directly because the ClaudeBox session was not
started with `ci-allow`, so `.github/` edits are blocked. Apply the snippet
below manually, or restart the request prefixed with `ci-allow`.

## Why

The only existing failure notification for `merge-train/spartan` in the merge
queue is `merge-queue-dequeue-notify.yml`, which fires on the
`pull_request: dequeued` event. If GitHub's merge queue retries an attempt and
the retry succeeds, the dequeue event never fires and the team gets no signal
about the underlying flake or failure. This adds a per-attempt notification so
every MQ failure for `merge-train/spartan` is surfaced in #team-alpha
(`C0AU8BULZHC`).

## Patch

Apply to `.github/workflows/ci3.yml` — insert the new step immediately after
the existing `Notify Slack on backport CI failure` step (before the
`Upload benchmarks` step) in the `ci` job:

```yaml
      # Fires on every merge-queue CI failure for merge-train/spartan, not just on dequeue
      # (the queue may retry, so merge-queue-dequeue-notify.yml alone misses individual failures).
      # CI_MODE=merge-queue-heavy is only set for merge-train/spartan in the merge queue
      # (see .github/ci3_labels_to_env.sh).
      - name: Notify Slack on merge-train/spartan merge-queue failure
        if: failure() && env.CI_MODE == 'merge-queue-heavy'
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          RUN_URL: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          if [ -n "${SLACK_BOT_TOKEN}" ]; then
            TEXT="CI3 failed in merge queue for *merge-train/spartan*: <${RUN_URL}|View Run>"
            curl -X POST https://slack.com/api/chat.postMessage \
              -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
              -H "Content-type: application/json" \
              --data "$(jq -n --arg c "C0AU8BULZHC" --arg t "$TEXT" '{channel:$c, text:$t}')"
          fi
```

## Detection logic

`env.CI_MODE == 'merge-queue-heavy'` is the cleanest signal for "this CI run
is for `merge-train/spartan` inside the merge queue". `.github/ci3_labels_to_env.sh`
only sets `CI_MODE=merge-queue-heavy` when the merge-group event corresponds to
a PR whose head branch is `merge-train/spartan`; standard merge-queue runs for
other PRs use `CI_MODE=merge-queue`.

## Test plan

- After merge, wait for a `merge-train/spartan` PR to fail in the merge queue
  and confirm a notification appears in #team-alpha.
- Verify non-spartan merge-queue runs do **not** post to this channel (their
  `CI_MODE` is `merge-queue`, not `merge-queue-heavy`).
