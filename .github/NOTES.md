# Release branches

`next` is where development happens; its version is the next major. Each released major has its own
branch that keeps receiving fixes: `v6` and `v5-next` today. A change that must ship in a release
goes to `next` first and is backported from there (see Backports below).

## How it works

### Public and private

Every branch exists in both `AztecProtocol/aztec-packages` (public) and
`AztecProtocol/aztec-packages-private`. The private branch is the public one plus private-only
commits, never the other way round:

```
public next     ──sync──►  public-next     ──merge──►  next      (private)
public v6       ──sync──►  public-v6       ──merge──►  v6        (private)
public v5-next  ──sync──►  public-v5-next  ──merge──►  v5-next   (private)
```

- `public-<branch>` is a pure mirror of the public branch, force-updated by `sync-upstream-<branch>.yml`.
- The same workflow then merges the mirror into the private branch. `next` and `v5-next` are synced
  on every public push (the public repo dispatches the workflow) and daily as a safety net; `v6` is
  polled every 30 minutes.
- If the merge conflicts, the workflow fails and ClaudeBox opens a conflict-resolution PR stack in
  #backports.
- Never cherry-pick public commits into a private branch by hand; the sync brings them in.

### Getting changes into a release branch

1. **Backport from `next`** (the normal path): merge to `next` with a `backport-to-<branch>` label,
   for example `backport-to-v6`. See Backports below.
2. **Direct PR**: open a PR against the release branch for a change that only makes sense there.
   Add the `private-port-next` label if it should also reach `next`; ClaudeBox forward-ports it.

### Nightly releases

Every night at 4:00 AM UTC, `nightly-release-tag.yml` tags `next`, `v5-next` and `v6` in the format `v{version}-nightly.{date}`, taking the version from `.release-please-manifest.json` on each branch. Pushing the tag triggers the release flow. The job only runs in the public `AztecProtocol/aztec-packages`; the private repo cuts no nightlies.

The workflow can also be dispatched manually. It then accepts an optional `suffix` input and tags `v{version}-nightly.{date}.{suffix}`, so an extra nightly can be cut on a day that already has one. The suffix must be lowercase letters, digits and hyphens starting with a letter, which keeps the tag a valid semver prerelease. Without a suffix, a manual run produces the canonical tag for the day and fails if it already exists: the workflow never moves an existing tag.

### Backports

To land a change on both `next` and a release branch (`v6`, `v5-next`, ...), open the PR against `next` and add a `backport-to-<branch>` label for each release branch it should reach, for example `backport-to-v6`. The label must already exist in the repository; a maintainer creates it once per release branch.

- On merge, `backport.yml` cherry-picks the merge commit onto `backport-to-<branch>-staging`, one matrix job per label. A label added after the merge backports to that branch only.
- Each staging branch has one rolling "chore: Accumulated backports to `<branch>`" PR. `backport-staging-pr.yml` keeps it open whenever the staging branch is ahead of the release branch. Backports reach the release branch when that PR merges.
- The author gets a comment on the original PR with the outcome. On a conflict, the comment explains the next steps and how to resolve the conflict by hand. The bot also posts in #backports with links to the PR, the author's GitHub login, and the run. It then starts ClaudeBox in that Slack thread, and ClaudeBox opens a conflict-resolution PR into the staging branch for the author to review.
- `merge-train-auto-merge.yml` merges a staging PR after 8 hours without new commits. Its hourly schedule only runs in `AztecProtocol/aztec-packages`; in `aztec-packages-private`, a maintainer merges the staging PR, or dispatches that workflow by hand. Auto-merge skips a staging PR while any PR into its staging branch is still open, so later backports never land ahead of a pending conflict resolution.
- CI failures on a staging PR are posted to #backports.
- Any other backport failure (an API or fetch error, a push that keeps losing races with concurrent backports) is reported on the PR and in #backports as an error to re-run, without dispatching ClaudeBox.
- `pull_request_target` runs the workflow from the PR's base branch, so PRs merged into a release branch use that branch's copy of `backport.yml` and its scripts.
- `scripts/backport_to_staging.test.sh` covers target selection and the staging script (conflicts, concurrent pushes, already-present changes) against a local remote; CI runs it with the ci3 tests.

### Automation summary

| Workflow | Trigger | Action |
|---|---|---|
| `nightly-release-tag.yml` | Daily at 04:00 UTC, or manual dispatch (public repo only) | Tags `next`, `v5-next` and `v6` with `v{version}-nightly.{date}`, plus an optional `.{suffix}` on manual runs |
| `backport.yml` | `backport-to-<branch>` label + PR merge | Cherry-picks into `backport-to-<branch>-staging`, one job per label |
| `backport-staging-pr.yml` | Push to `backport-to-*-staging` | Opens or refreshes the accumulated backports PR |
| `sync-upstream-v6.yml` | Every 30 minutes, or dispatch | Mirrors public `v6` onto `public-v6` and merges it into private `v6` |
