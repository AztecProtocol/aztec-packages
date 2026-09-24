# Release branches

`next` is the development branch. Release lines (for example `v6`) take changes from `next` through ports, or through PRs opened directly against the release branch.

### Ports

Label a PR `port-to-<branch>` (`port-to-v6`, `port-to-next`) to port it to that branch once it merges; adding the label after merge works too. This repo has no port or backport workflow: ClaudeBox watches merged PRs through the GitHub webhook, ports each labelled change onto one rolling integration branch per target, and keeps a single PR into the target branch, reporting in #backports. The labels, their targets and the procedure live in [AztecProtocol/claudebox](https://github.com/AztecProtocol/claudebox) (`claudebox-server/config.yml` `merge_triggers`, and the `port-to-branch` skill). Change port automation there, not here.

### Nightly releases

Every night at 4:00 AM UTC, `nightly-release-tag.yml` tags both `next` and `v5-next` in the format `v{version}-nightly.{date}`, taking the version from `.release-please-manifest.json` on each branch. Pushing the tag triggers the release flow.

The workflow can also be dispatched manually. It then accepts an optional `suffix` input and tags `v{version}-nightly.{date}.{suffix}`, so an extra nightly can be cut on a day that already has one. The suffix must be lowercase letters, digits and hyphens starting with a letter, which keeps the tag a valid semver prerelease. Without a suffix, a manual run produces the canonical tag for the day and fails if it already exists: the workflow never moves an existing tag.

### Automation summary

| Workflow | Trigger | Action |
|---|---|---|
| `nightly-release-tag.yml` | Daily at 04:00 UTC, or manual dispatch | Tags `next` and `v5-next` with `v{version}-nightly.{date}`, plus an optional `.{suffix}` on manual runs |
