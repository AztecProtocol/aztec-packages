---
name: worktrees
description: Create and manage fast git worktrees for yarn-project work, backed by the shared frozen deps store (scripts/worktrees.sh at the git root). Use when creating a worktree, rebuilding an upstream component inside one (thaw), refreshing links after a rebase, debugging EACCES/read-only file errors in a worktree, or cleaning up the store (gc).
argument-hint: <create|status|thaw|gc> [args]
---

# Fast Worktrees via the Frozen Deps Store

`scripts/worktrees.sh` (at the git root) creates aztec-packages worktrees that are ready to build
and test yarn-project in minutes instead of a full multi-minute `./bootstrap.sh`. Upstream build
artifacts (bb, nargo, contract artifacts, l1-contracts outputs) come from a shared read-only store
as symlinks; the yarn-project layer (`node_modules`, `dest/`, generated outputs) is copied from the
source checkout as writable per-worktree files.

This flow is for **yarn-project development only**: the worktree's yarn-project layer is fully
writable while everything upstream is frozen. Development on other components (barretenberg, noir,
l1-contracts, ...) should use vanilla `git worktree add` plus that component's bootstrap.

Full mechanics are in `scripts/worktrees.md`; command reference in
`$(git rev-parse --show-toplevel)/scripts/worktrees.sh --help`. To spawn a Claude instance inside a
new worktree, use the `worktree-spawn` skill instead — it builds on this one.

## Prerequisite Check — Bail to Vanilla Worktrees

Before using this script, check that `CACHE_LOCAL_DIR` is set in the environment:

```bash
[ -n "${CACHE_LOCAL_DIR:-}" ] && echo "ok: $CACHE_LOCAL_DIR" || echo "NOT SET"
```

If it is **not set**, do NOT use `worktrees.sh` — the store would silently derive from the default
`~/.cache/aztec-build-cache`, which other shells (and future `gc` runs) may not share. Fall back to
a vanilla worktree instead:

```bash
git -C "$(git rev-parse --show-toplevel)" worktree add -b <initials>/<branch> ../<name> <base-ref>
(cd ../<name> && ./bootstrap.sh fast)   # full bootstrap; takes many minutes
```

Also required: the source checkout must be bootstrapped (`yarn-project/node_modules` exists).

## Commands

Run via the git root (yarn-project sessions have CWD `yarn-project`, so use an absolute path):

```bash
WT=$(git rev-parse --show-toplevel)/scripts/worktrees.sh

"$WT" create <name> [base-ref]   # worktree at <parent-of-checkout>/<name>, branch <initials>/<name>
"$WT" create <name> --dry-run    # print resolved source/path/branch, change nothing
"$WT" status [path]              # linked entries, provenance, yarn.lock drift
"$WT" thaw <path>...             # store symlinks -> writable copies (before local rebuilds)
"$WT" gc [--dry-run]             # remove store entries no live checkout references
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
  `"$WT" thaw barretenberg/cpp/build`. Re-running that component's bootstrap in link mode
  re-freezes it (repoints symlinks at the store).
- **Never** `chmod +w` a store path or write through a symlink into `$CACHE_LOCAL_DIR/extracted/` —
  entries are shared by every worktree on the machine.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `EACCES`/read-only error writing under an upstream component | Path is a symlink into the frozen store | `"$WT" thaw <path>`, retry |
| Component rebuilds locally at create time | Cache miss: base-ref not built by CI, edited `bootstrap.sh`/`.rebuild_patterns` inputs, or untracked non-ignored files flipping the hash to `disabled-cache` | Expected and correct, just slow. Check `git status`; base on a CI-built ref. The local build populates `CACHE_LOCAL_DIR`, so it is paid once per machine |
| Every hash is wrong / everything misses in a fresh worktree driven by hand | `noir/noir-repo` submodule not initialized (hash corruption cascades downstream) | `git submodule update --init noir/noir-repo` before any bootstrap (`create` does this) |
| Stale artifacts after rebasing the worktree across upstream changes | Symlinks still point at old content-addressed entries | Re-run that component's bootstrap in the worktree with `CACHE_LINK_DIR` and `CACHE_LOCAL_DIR` exported |
| Module resolution errors after changing `yarn.lock` | Copied `node_modules` predates the lockfile | Delete `yarn-project/node_modules`, run `yarn install` (`status` flags this drift) |
| Download of one tarball hangs ~2 min then fails | Stale `.lock.<entry>` dir in the store from a killed extraction | Remove the `.lock.*` dir under `$CACHE_LOCAL_DIR/extracted/`, retry |

## Cleanup

```bash
git -C "$(git rev-parse --show-toplevel)" worktree remove <worktree-path>
"$WT" gc   # then sweep unreferenced store entries
```

`gc` roots are the manifests of checkouts in `git worktree list` — it does not see separate clones
sharing the same store, so do not point two clones at one `CACHE_LOCAL_DIR` if you run `gc`.

## Testing Changes to These Scripts

`scripts/worktrees.test.sh` (at the git root) is a hermetic, manually-run suite (not wired into CI)
covering link-mode grafting, freeze semantics, thaw, gc, and concurrency. Run it after modifying
`ci3/cache_download`, `ci3/cache_download_linked`, `ci3/cache_upload`, or `scripts/worktrees.sh`.
