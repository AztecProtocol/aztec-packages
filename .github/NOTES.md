# Release branches

`next` is the development branch. Release lines (for example `v5-next` and `v6`) take changes from `next` through backports, or through PRs opened directly against the release branch.

### Backports

- Label a PR with `backport-to-<branch>` (for example `backport-to-v6` or `backport-to-v5-next`) to backport it once it merges.
- On merge, `backport.yml` cherry-picks the change onto a `backport-to-<branch>-staging` branch, and a staging PR accumulates backported commits targeting `<branch>`.
- If the cherry-pick conflicts, the run posts to #backports and fails. ClaudeBox receives the failed run's `workflow_run` webhook and opens a resolution PR into the staging branch. CI holds no ClaudeBox credentials.

### Nightly releases

Every night at 4:00 AM UTC, `nightly-release-tag.yml` tags both `next` and `v5-next` in the format `v{version}-nightly.{date}`, taking the version from `.release-please-manifest.json` on each branch. Pushing the tag triggers the release flow.

The workflow can also be dispatched manually. It then accepts an optional `suffix` input and tags `v{version}-nightly.{date}.{suffix}`, so an extra nightly can be cut on a day that already has one. The suffix must be lowercase letters, digits and hyphens starting with a letter, which keeps the tag a valid semver prerelease. Without a suffix, a manual run produces the canonical tag for the day and fails if it already exists: the workflow never moves an existing tag.

### Automation summary

| Workflow | Trigger | Action |
|---|---|---|
| `nightly-release-tag.yml` | Daily at 04:00 UTC, or manual dispatch | Tags `next` and `v5-next` with `v{version}-nightly.{date}`, plus an optional `.{suffix}` on manual runs |
| `backport.yml` | `backport-to-<branch>` label + PR merge | Cherry-picks into `<branch>` via a staging branch; fails the run on conflict |
