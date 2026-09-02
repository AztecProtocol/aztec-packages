# Fast worktrees via a shared frozen deps store

`scripts/worktrees.sh create` makes a git worktree of aztec-packages ready to build and test in
minutes instead of the many-minute full `./bootstrap.sh`, by reusing build artifacts that already
exist: the ci3 build cache for upstream components, and the source checkout's yarn layer for
yarn-project. This document explains how the pieces fit together; see `scripts/worktrees.sh --help`
for command-by-command usage.

## The two pieces

1. **Link mode in `ci3/cache_download`** (env var `CACHE_LINK_DIR`). Every component bootstrap
   already downloads content-addressed tarballs (`<component>-<contenthash>.tar.gz`) from the build
   cache, optionally keeping them in a local tarball cache (`CACHE_LOCAL_DIR`). With
   `CACHE_LINK_DIR` set, instead of extracting a tarball into the checkout, `cache_download`
   extracts it ONCE into a shared store and grafts symlinks into the checkout. CI never uses this
   path (hard-guarded on `$CI`).

2. **`scripts/worktrees.sh`** orchestrates worktree creation on top of it: `git worktree add`, init
   the `noir/noir-repo` submodule, copy the writable yarn-project layer from the source checkout,
   run each upstream component's bootstrap inside the worktree with `CACHE_LINK_DIR` exported, and
   record a manifest. It also provides `status`, `thaw`, and `gc`.

## The store

```
$CACHE_LOCAL_DIR/                      # default ~/.cache/aztec-build-cache
  <name>.tar.gz | <name>.zst           # tarball cache (pre-existing behavior)
  extracted/                           # $CACHE_LINK_DIR
    <name>/                            # one tarball, extracted once, then chmod -R a-w
```

Entries are **content-addressed** (the tarball name embeds the content hash of the component's
inputs), so an entry never changes after creation — every checkout that links `noir-<hash>` sees
identical bytes forever. Extraction goes into a temp dir and is atomically renamed into place, with
an mkdir-based lock so concurrent downloads of the same entry (e.g. per-contract tarballs fetched in
parallel) extract exactly once.

Entries are **frozen** (`chmod -R a-w`). Any accidental write through a worktree symlink — a stray
rebuild, codegen, `yarn install` in the wrong place — fails immediately with `EACCES` instead of
silently corrupting state shared by every other worktree. This is the core safety property: shared
state is immutable by construction *and* enforced by the filesystem.

## Grafting

For each path in the tarball listing, the graft walks components top-down through directories that
already exist as real (non-symlink) dirs in the checkout — tracked dirs, the uninitialized-submodule
dir, thawed local copies — and creates one absolute symlink at the first missing component (the
"link root"). A real file/dir already present at a link root is left alone with a warning: it is
treated as a deliberate local override (e.g. a thawed component).

One subtlety: a link root must be **gitignored once created**, and gitignore patterns with a
trailing slash (`build*/`) match directories only — a symlink at that path would show up as
untracked, dirtying `git status` and, worse, flipping the repo's content hashes to "disabled-cache"
(uncommitted-changes detection), which silently disables caching for everything. So after deciding a
link root the graft asks `git check-ignore`: if the would-be symlink is not ignored and the store
side is a directory, it creates a *real* directory there instead (real dirs do match dir-only
patterns) and pushes the link root one level deeper, repeating until the path is ignored. Submodule
paths are checked against the submodule's own ignore rules.

## What is never linked (extracted in place instead)

- **`yarn-project-*`**: its outputs interleave with tracked `src/` files and must stay writable for
  incremental rebuilds (`yarn build` writes `dest/`).
- **`bb.js-*` and `noir-packages-*`**: their contents are loaded as Node.js modules, and Node
  resolves imports from a module's **real path**. Code living in the store cannot see the checkout's
  `node_modules`, so runtime dependencies (`msgpackr`, `pako`, …) fail to resolve. They must be real
  files inside the checkout tree. (~30M per worktree.)

Everything else — bb binaries and wasm, `nargo`/`acvm`, transpiler binary, `l1-contracts` build
outputs, per-contract and per-circuit artifacts — is data or executables that nothing resolves
modules from, and stays in the store.

## Per-checkout stamping on cache hits

Some bootstraps deliberately mutate cached artifacts after extraction, which conflicts with a frozen
store. Three sites were made store-tolerant:

- `barretenberg/cpp` `inject_version` patches the version into `bb`/`bb-avm` binaries in place; it
  now **skips read-only binaries** (a worktree's `bb --version` reports the unstamped sentinel —
  harmless for development).
- `noir-contracts` `stamp_dev_aztec_version` rewrites every contract JSON with
  `aztec_version: "dev"`; it now **replaces by rename**, so in a worktree the store symlink is
  swapped for a real stamped copy (the store stays pristine), and it is idempotent. Freshly-built
  contracts are additionally **stamped before `cache_upload`**, so newly-cached tarballs already
  carry the field and the post-hit stamp fast-paths to a no-op, leaving the symlink in place; only
  tarballs predating that change get materialized as real copies.
- `bb.js` copies test snapshots into `dest/` so its own tests can run from there; it now **skips
  when dest is read-only** (moot anyway now that bb.js extracts in place).

If you add a bootstrap step that writes into a component's cached output directory after a cache
hit, follow one of these patterns or the step will fail with `EACCES` in linked worktrees.

## Content-hash pitfalls (why your cache might miss)

- **`noir/noir-repo` must be an initialized submodule** before computing any hash: in an empty
  submodule dir, `git -C noir-repo rev-parse HEAD` walks up and returns the *parent repo's* HEAD,
  corrupting the noir hash and — through the dependency chain (avm-transpiler → barretenberg →
  bb.js) — almost every other hash. `create` inits it first; keep that in mind if you drive
  bootstraps manually in a fresh worktree.
- **Editing a component's `bootstrap.sh`** (or anything matched by its `.rebuild_patterns`) changes
  its content hash — the recipe is part of the input. Worktrees based on such a branch rebuild that
  component locally until CI builds the branch and uploads tarballs at the new hashes. The pain is
  one-time per machine: `cache_upload` saves locally-built artifacts into `CACHE_LOCAL_DIR` even
  with `CI=0`, so the first local build at a new hash populates the cache and later worktrees link
  from it.
- **Untracked, non-ignored files** under a component flip its hash to `disabled-cache`. Keep
  checkouts clean of stray scratch files, or expect local rebuilds.

## Manifests and gc

Each linked checkout has `.deps-manifest.json` (consolidated at create time) plus
`.deps-manifest.linked` (crash-safe append log written by `cache_download`), both gitignored. They
record which store entries the checkout references; living *inside* the worktree, they disappear
with it. `gc` is mark-and-sweep: roots are the manifests of every checkout in `git worktree list`,
unreferenced entries are deleted (`chmod -R u+w` first — they are frozen), with a final
symlink-scan safety net before each deletion, and stale tarballs older than `--keep-days` go too.

## Day-to-day

```bash
# create (run from anywhere inside your built checkout; ~2-5 min on cache hits). The worktree lands
# as a sibling of the checkout (<parent>/my-feature) on branch <initials>/my-feature.
scripts/worktrees.sh create my-feature
scripts/worktrees.sh create my-feature origin/next
scripts/worktrees.sh create my-feature --dry-run   # print resolved source/path/branch, no changes

# work: yarn build / yarn test in the worktree's yarn-project is fully isolated (local copies)

# rebuild an upstream component locally (bb, contracts, ...): thaw first
scripts/worktrees.sh thaw barretenberg/cpp/build

# after rebasing the worktree across upstream changes: re-run that component's bootstrap in link
# mode to repoint at the new content
(cd <worktree>/noir && CACHE_LINK_DIR=... CACHE_LOCAL_DIR=... ./bootstrap.sh)

# inspect / clean up
scripts/worktrees.sh status
git worktree remove <worktree> && scripts/worktrees.sh gc
```

Set `CACHE_LOCAL_DIR` consistently (e.g. export it from a profile that non-interactive shells also
read): the store derives from it, and a shell that misses the export will look at an empty default
(`~/.cache/aztec-build-cache`) and re-download or rebuild everything.
