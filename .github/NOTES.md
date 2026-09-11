# v4-next Branch

`v4-next` is a forward-looking branch that builds on top of `v4`. It contains everything in `v4` plus additional features and changes that are staged for the next v4 release cycle.

## How it works

### Branch relationship

```
next (v5 development)
  │
  v4  ──────────────►  v4-next
  (stable v4 releases)   (next v4 features)
```

- `v4-next` is branched off `v4` and stays up to date with it automatically.
- Changes merged to `v4` flow into `v4-next` on every merge via the `pull-v4-into-v4-next` workflow.
- If a merge conflict occurs, a PR is automatically created for manual resolution.

### Getting changes into v4-next

There are three ways to land code in `v4-next`:

1. **Via v4**: Any PR merged to `v4` is automatically pulled into `v4-next`.
2. **Backport from next**: Add the `backport-to-v4-next` label to a PR targeting `next`. On merge, the backport workflow will cherry-pick the changes into `v4-next` via a staging branch.
3. **Direct PR**: Open a PR directly targeting `v4-next` for changes that are only relevant to the next release.

### Nightly releases

Every night at 4:00 AM UTC, `nightly-release-tag.yml` tags both `next` and `v5-next` in the format `v{version}-nightly.{date}`, taking the version from `.release-please-manifest.json` on each branch. Pushing the tag triggers the release flow.

The workflow can also be dispatched manually. It then accepts an optional `suffix` input and tags `v{version}-nightly.{date}.{suffix}`, so an extra nightly can be cut on a day that already has one. The suffix must be lowercase letters, digits and hyphens starting with a letter, which keeps the tag a valid semver prerelease. Without a suffix, a manual run produces the canonical tag for the day and fails if it already exists: the workflow never moves an existing tag.

### Backports

The existing backport infrastructure (`backport.yml`) works with `v4-next` out of the box:

- Label a PR with `backport-to-v4-next` to backport it.
- On merge, the changes are cherry-picked onto a `backport-to-v4-next-staging` branch.
- If cherry-pick fails, ClaudeBox is dispatched to resolve conflicts automatically.
- A staging PR accumulates backported commits targeting `v4-next`.

### Automation summary

| Workflow | Trigger | Action |
|---|---|---|
| `pull-v4-into-v4-next.yml` | Push to `v4` | Merges `v4` into `v4-next`; creates conflict PR if needed |
| `nightly-release-tag.yml` | Daily at 04:00 UTC, or manual dispatch | Tags `next` and `v5-next` with `v{version}-nightly.{date}`, plus an optional `.{suffix}` on manual runs |
| `backport.yml` | `backport-to-v4-next` label + PR merge | Cherry-picks into `v4-next` via staging branch |
