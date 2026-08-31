# labs-patches

The foundation's changes to the labs repo, kept as a `git format-patch` series that is applied on top of the `labs/` submodule (aztec-node) every time it is checked out.

`labs/` is pinned to an upstream commit (the gitlink). `bootstrap.sh apply` checks that commit out and runs `git am` over `*.patch` in name order, so the patches become real commits in the submodule and `labs/` HEAD sits ahead of the gitlink. It is idempotent and runs from the root `bootstrap.sh`, the `post-merge`/`post-checkout` hooks and `make labs-patched`, so a fresh clone, a pull and a build all land on the same patched tree. It never discards commits that are not in the series: if the base or the series changed under work in progress, it stops and asks you to `export` or drop it (`LABS_PATCHES_FORCE=1` discards them — a last resort, not a workflow). Uncommitted tracked edits in `labs/` are stashed (`git -C labs stash list`) rather than reset when a re-apply is needed.

The build then rewrites the labs manifests to consume this checkout (`labs-aztec-toolchain use-local`), records the content hashes of the foundation components labs consumes in `labs-aztec-toolchain/fnd-hashes` (`scripts/labs_fnd_hashes.sh`), refreshes the lockfiles, and commits the result on top as a marker commit (`bootstrap.sh commit-use-local`), so the labs tree is clean for ci3's cache hashing and yarn's immutable installs, and every labs cache key follows the foundation tree. Marker commits are recognised by their subject and are never exported.

The `pre-commit` hook refuses a commit that stages a patched or marker commit as the gitlink: those commits exist only in your clone.

## Changing the series

```
./labs-patches/bootstrap.sh apply     # patched labs/ checkout
cd labs && <edit> && git commit       # one commit per patch, on top of what is there
cd .. && ./labs-patches/bootstrap.sh export
git add labs-patches && git commit    # the regenerated .patch files
```

To edit or drop an existing patch, `git rebase -i <gitlink>` inside `labs/` and export again. `status` lists commits in `labs/` that are not exported yet.

## Moving the pin

```
./labs-patches/bootstrap.sh bump main        # or a tag / sha
```

fetches the ref, stages the new gitlink and re-applies the series. If a patch no longer applies, `apply` aborts the `am`; fix it up in `labs/` (`git am --3way` conflicts, or cherry-pick the remaining patches by hand), then `export`. Patches that upstream has absorbed simply disappear from the export.

`bootstrap.sh check` verifies the series applies to the gitlink in a temporary worktree without touching `labs/`. CI runs it, together with `tests/lifecycle_test` (the tooling exercised end to end against a sandbox fixture: apply, export, marker commits, bumps, the guards), through `make labs-patches-tests`; `bootstrap.sh test` runs both locally.

## Upstreaming patches

The series is a queue of things to upstream: every patch here is carried through every bump until it lands in aztec-node. The foundation side pushes nothing to aztec-node — the `.patch` files in this directory are the handoff, and the labs team applies them directly:

```
git am <aztec-packages>/labs-patches/0005-*.patch    # from an aztec-node checkout
```

A patch that does not depend on a foundation version bump can land any time; one that does has to wait for the release that bump points at. When a patch lands upstream, `bump` past it and it disappears from the next `export`.

```
./labs-patches/bootstrap.sh upstream 1 2 3          # patch numbers or .patch paths; --branch <name> to choose the branch
```

`upstream` builds a local preview: a branch in `labs/`'s repository at the recorded base with the named patches applied in series order, under your own git identity (the series itself is applied with a fixed one) — what the drained result will look like. It pushes nothing and the branch is never pushed.

Everything else in this directory (`bootstrap.sh`, the tests, `test_cmd_skip`) is the foundation's own tooling and never goes upstream.

## Disabled patches

`apply` globs `*.patch`, so a patch renamed to `*.patch.disabled` is kept in the queue but not applied.
