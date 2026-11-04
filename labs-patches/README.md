# labs-patches

The foundation's changes to the labs repo, kept as a `git format-patch` series that is applied on top of the `labs/` submodule (aztec-node) every time it is checked out.

`labs/` is pinned to an upstream commit (the gitlink). The submodule has `update = none` in `.gitmodules`, so only `bootstrap.sh apply` checks it out:

- `apply` checks the gitlink out and runs `git am` over `*.patch` in name order, with a fixed committer identity so the applied SHAs are identical on every machine. The patches become real commits in the submodule, so `labs/` HEAD sits ahead of the gitlink. When the series is empty, `apply` only checks out the gitlink.
- `apply` is idempotent. The root `bootstrap.sh`, the `post-merge`/`post-checkout` hooks and `make labs-patched` all run it, so a fresh clone, a pull and a build land on the same patched tree.
- `apply` never discards commits that are not in the series. If the base or the series changed under work in progress, it stops and asks you to `export` or drop that work. `LABS_PATCHES_FORCE=1` discards them; use it only as a last resort.
- When a re-apply is needed, uncommitted tracked edits in `labs/` are stashed (`git -C labs stash list`), not reset.
- State lives in `.git/modules/labs/labs-patches.state`: a stamp of base and series, the patched head, and the applied commits. Applied commits are recognised by `git patch-id`, so a lost state file is re-derived from content.

The build then:

1. rewrites the labs manifests to consume this checkout (`labs-aztec-toolchain use-local`);
2. records the content hashes of the foundation components labs consumes in `labs-aztec-toolchain/fnd-hashes` (`scripts/labs_fnd_hashes.sh`);
3. refreshes the lockfiles;
4. commits the result on top as a marker commit (`bootstrap.sh commit-use-local`, subject `labs-patches: use-local rewrite (never exported)`). It stages only `package.json`, `yarn.lock`, `Nargo.toml` and `fnd-hashes`; other edits stay in the worktree.

The marker commit keeps the labs tree clean for ci3's cache hashing and yarn's immutable installs, and makes every labs cache key follow the foundation tree. Marker commits are recognised by their subject and are never exported.

The `pre-commit` hook runs `bootstrap.sh check_staged`. It refuses a commit that stages a patched or marker commit as the gitlink: those commits exist only in your clone. If `git status` shows ` M labs` after `git add -u` or `git commit -a`, unstage it with `git restore --staged labs`. Move the pin only with `bump` (below).

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

`bootstrap.sh check` verifies the series applies to the gitlink in a temporary worktree without touching `labs/`. CI runs it, together with `tests/lifecycle_test` (the tooling exercised end to end against a sandbox fixture: apply, export, marker commits, bumps, the guards), through `make labs-patches-tests`. `bootstrap.sh test` runs both locally; `bootstrap.sh test_cmds` lists them.

## Upstreaming a patch

The series is a queue of things to upstream: every patch here is carried through every bump, so open the aztec-node PR early and let the patch drop out when it lands.

```
./labs-patches/bootstrap.sh upstream 3            # or a .patch path; optional branch name as 2nd arg
git -C labs push origin fnd/<patch-slug>
gh pr create --repo aztec-labs-eng/aztec-node --head fnd/<patch-slug> --base main --fill
```

`upstream` creates the branch in `labs/`'s repository at the recorded base with only that patch applied, under your own git identity (the series itself is applied with a fixed one). It pushes nothing; the two commands it prints do. When the PR is merged, `bump` past it and the patch disappears from the next `export`.

Everything else in this directory (`bootstrap.sh`, the tests, `test_cmd_skip`) is the foundation's own tooling and never goes upstream.

## Disabled patches

`apply` globs `*.patch`, so a patch renamed to `*.patch.disabled` is kept in the queue but not applied.

## Building labs against this tree

The root `Makefile` builds and tests the labs submodule against this tree's packages and binaries.

- `make labs-deps` builds what labs consumes from here: `bb-ts`, `bb-avm-sim`, `bb-cdb`, `wsdb`, `l1-contracts`, `constants-codegen`, `noir-projects-fnd` and `fnd-artifacts-stage`, and their dependencies.
- `make labs-use-local` runs the build steps above: `labs/labs-aztec-toolchain/bootstrap.sh use-local` (manifests point at this tree via `portal:`), `scripts/labs_fnd_hashes.sh`, a lockfile refresh in `yarn-project` and `docs`, and `commit-use-local`. Do not run that sequence by hand or commit its output; every build redoes it.
- `make labs-fast` builds and tests the goals in `LABS_FAST_GOALS`: labs compiled against the portals with its unit and e2e tests, plus `aztec-nr`, `noir-contracts` and the contract snapshots built with this tree's `nargo` and `bb`. This is what a foundation change can break.
- `make fast-labs` is `labs-fast` plus `labs-docs-refs-check`. `make fast` runs it after `fast-foundation`.
- `make labs-full` adds `LABS_FULL_GOALS`: `docs`, `spartan`, `playground`, the claude tooling tests and the yarn-project benches.
- `make labs-yarn-project` builds only yarn-project. `make bench-labs` runs the labs benches on demand; they are not in the default `bench_cmds`.

Every labs `make` from the root goes through `LABS_MAKE` (`scripts/labs_env.sh $(MAKE)`). Run `scripts/labs_env.sh <cmd>` for any ad-hoc command inside `labs/`. The script:

- clears the inherited ci3 `root`/`ci3`, so labs' ci3 derives its own;
- exports `TEST_CMD_PREFIX` (`cd labs && export root= ci3= && `). Labs' `ci3/prefix_test_cmds` reads it, so the foundation test engine, which runs from this root, can execute labs test lines;
- exports `TEST_CMD_SKIP` from `test_cmd_skip`: a regex of labs tests that cannot run here. Most of them mount or package only the labs checkout, where the portals do not resolve. See the file for the list.

`scripts/labs_test_cmds.sh` collects labs test and bench commands for the test engine with the same environment.

Cache identity: `scripts/labs_fnd_hashes.sh` writes `labs/labs-aztec-toolchain/fnd-hashes`, one `<component>=<content hash>` line per provider, plus `optional=` naming the optional binaries this tree built. In foundation mode, the labs toolchain hash is the content hash of that directory. Every labs build and test cache key therefore follows the foundation tree, and a dirty provider disables labs caching.
