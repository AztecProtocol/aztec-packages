---
name: worktrees
description: Create and manage fast git worktrees backed by the shared frozen deps store (scripts/worktrees.sh). Use when creating a worktree, rebuilding an upstream component inside one (thaw), refreshing links after a rebase, debugging EACCES/read-only file errors in a worktree, or cleaning up the store (gc).
argument-hint: <create|status|thaw|gc> [args]
---

# Fast Worktrees via the Frozen Deps Store

`scripts/worktrees.sh` creates aztec-packages worktrees that are ready to build and test in minutes
instead of a full multi-minute `./bootstrap.sh`. Upstream build artifacts (bb, nargo, contract
artifacts, l1-contracts outputs) come from a shared read-only store as symlinks; the yarn-project
layer (`node_modules`, `dest/`, generated outputs) is copied from the source checkout as writable
per-worktree files.

Full mechanics are in `scripts/worktrees.md`; command reference in `scripts/worktrees.sh --help`.
To spawn a Claude instance inside a new worktree, use the `worktree-spawn` skill instead — it builds
on this one.

## Prerequisites

- Run from anywhere inside a **bootstrapped** checkout (it needs `yarn-project/node_modules`); that
  checkout is the source the worktree is seeded from.
- `CACHE_LOCAL_DIR` must point at the same tarball cache in every shell (default
  `~/.cache/aztec-build-cache`). Export it from a profile that non-interactive shells also read; a
  shell without it re-downloads or rebuilds everything into the default location.

## Commands

```bash
scripts/worktrees.sh create <name> [base-ref]   # worktree at <parent-of-checkout>/<name>, branch <initials>/<name>
scripts/worktrees.sh create <name> --dry-run    # print resolved source/path/branch, change nothing
scripts/worktrees.sh status [path]              # linked entries, provenance, yarn.lock drift
scripts/worktrees.sh thaw <path>...             # store symlinks -> writable copies (before local rebuilds)
scripts/worktrees.sh gc [--dry-run]             # remove store entries no live checkout references
```

- `base-ref` defaults to the source checkout's HEAD. Prefer a CI-built ref (e.g. `origin/next`) for
  cache hits; a base with unbuilt changes to a component's inputs means that component builds locally.
- Branch naming: `<initials>/<name>` from git `user.initials` (else derived from `user.name`). A
  `<name>` containing a slash IS the branch (`create ab/fix-x` → branch `ab/fix-x`, dir `fix-x`);
  `--branch <branch>` overrides.
- `--frozen-only` aborts on a cache miss instead of building locally.

## Rules Inside a Linked Worktree

- **Safe without thawing**: `yarn build`, `yarn test`, workspace rebuilds — the whole yarn-project
  layer is worktree-local writable copies.
- **Thaw first**: rebuilding an upstream component (`barretenberg/cpp`, `noir`, `noir-projects`,
  `l1-contracts`, ...) or running codegen that writes into its outputs. Example:
  `scripts/worktrees.sh thaw barretenberg/cpp/build`. Re-running that component's bootstrap in link
  mode re-freezes it (repoints symlinks at the store).
- **Never** `chmod +w` a store path or write through a symlink into `$CACHE_LOCAL_DIR/extracted/` —
  entries are shared by every worktree on the machine.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `EACCES`/read-only error writing under an upstream component | Path is a symlink into the frozen store | `scripts/worktrees.sh thaw <path>`, retry |
| Component rebuilds locally at create time | Cache miss: base-ref not built by CI, edited `bootstrap.sh`/`.rebuild_patterns` inputs, or untracked non-ignored files flipping the hash to `disabled-cache` | Expected and correct, just slow. Check `git status`; base on a CI-built ref. The local build populates `CACHE_LOCAL_DIR`, so it is paid once per machine |
| Every hash is wrong / everything misses in a fresh worktree driven by hand | `noir/noir-repo` submodule not initialized (hash corruption cascades downstream) | `git submodule update --init noir/noir-repo` before any bootstrap (`create` does this) |
| Stale artifacts after rebasing the worktree across upstream changes | Symlinks still point at old content-addressed entries | Re-run that component's bootstrap in the worktree with `CACHE_LINK_DIR` and `CACHE_LOCAL_DIR` exported |
| Module resolution errors after changing `yarn.lock` | Copied `node_modules` predates the lockfile | Delete `yarn-project/node_modules`, run `yarn install` (`status` flags this drift) |
| Download of one tarball hangs ~2 min then fails | Stale `.lock.<entry>` dir in the store from a killed extraction | Remove the `.lock.*` dir under `$CACHE_LOCAL_DIR/extracted/`, retry |

## Cleanup

```bash
git worktree remove <worktree-path>   # from the source checkout
scripts/worktrees.sh gc               # then sweep unreferenced store entries
```

`gc` roots are the manifests of checkouts in `git worktree list` — it does not see separate clones
sharing the same store, so do not point two clones at one `CACHE_LOCAL_DIR` if you run `gc`.

## Testing Changes to These Scripts

`scripts/worktrees.test.sh` is a hermetic, manually-run suite (not wired into CI) covering link-mode
grafting, freeze semantics, thaw, gc, and concurrency. Run it after modifying
`ci3/cache_download`, `ci3/cache_upload`, or `scripts/worktrees.sh`.
