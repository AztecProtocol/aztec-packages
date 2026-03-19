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

Every night at 5:00 AM UTC, `nightly-release-tag-v4-next.yml` creates a tag from `v4-next` in the format `v{version}-nightly.{date}`. This mirrors the nightly release process on `next`.

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
| `nightly-release-tag-v4-next.yml` | Daily at 05:00 UTC | Tags `v4-next` with `v{version}-nightly.{date}` |
| `backport.yml` | `backport-to-v4-next` label + PR merge | Cherry-picks into `v4-next` via staging branch |
