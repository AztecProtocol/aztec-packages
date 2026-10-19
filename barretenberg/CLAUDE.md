Commands are relative to the repository root unless a `cd` is shown.

# Git workflow for barretenberg

Base branch is `merge-train/barretenberg` on the `next` line; see root `CLAUDE.md` under `<git_workflow>` for the full component→base mapping, the `git diff`/`git log` forms and the release-line bases. On a release line such as `v6`, target the release branch and use the `port-to-<branch>` labels described in root `CLAUDE.md`.

- When your branch is out of date with the base, rebase (don't merge): `git fetch origin merge-train/barretenberg && git rebase origin/merge-train/barretenberg`.
- Force-push only after a rebase or when you must rewrite history. While iterating, use a regular `git push` after each commit so the iteration history stays visible.
- Open PRs with `gh pr create --base merge-train/barretenberg`.

Barretenberg issues are tracked at `AztecProtocol/barretenberg` (separate repo), not `AztecProtocol/aztec-packages`. PRs go to `AztecProtocol/aztec-packages` but should reference issues from `AztecProtocol/barretenberg`.

Run `make fast` at the top level to be sure the repo fully builds (root `./bootstrap.sh` with no arguments does the same).
Bootstrap scripts can be called with relative paths e.g. ../barretenberg/bootstrap.sh

## CI labels for PRs

Add GitHub labels to PRs to control what CI runs. Use at most one of these mode labels per PR; CI rejects a PR that has two. Choose based on what changed:

- **`ci-barretenberg`** — Barretenberg-only builds (default for `merge-train/barretenberg` branch). Core tests, no cross-compilation.
- **`ci-barretenberg-full`** or **`ci-full`** — Full builds including cross-compilation (macOS, iOS, ARM64 Linux), SMT verification, ASAN, and GCC syntax checks. Use when changing CMake presets, bootstrap.sh, or build infrastructure.
- **`ci-full-no-test-cache`** — Like `ci-full`, but reruns tests without the test cache.
- **`ci-release-pr`** — Creates a test release tag for pre-release validation. Use when changing release packaging or publish workflows.

## Code comments

Comments must describe the code as it is, not relative to what it used to be. Never write comments like "replaces the old X", "no longer needs Y", "previously this was Z", or "eliminates the need for W". These become stale immediately after the commit lands. Instead, describe what the code does and why.

## Handling noir/noir-repo submodule

If `git status` shows `noir/noir-repo` as modified but your changes have nothing to do with updating noir, run:

```bash
git submodule update noir/noir-repo
```

This resets the submodule to the correct commit for the current branch. This commonly happens when switching branches.

**Note:** If you're intentionally updating the noir submodule to a newer version, use the `noir-sync-update` skill instead, which handles the full update workflow including `Cargo.lock` and `yarn.lock` updates.

# Modules

## ts/ => typescript code for bb.js

Bootstrap modes:

- `./bootstrap.sh` => generate TypeScript bindings and build. See `ts/bb.js/package.json` for more fine-grained commands.
  Other commands, run from `barretenberg/ts/bb.js`:
- `BB_BINARY_PATH=<bb> yarn generate && yarn build:esm` => the quickest way to rebuild, if only changes inside ts/ folder, and only testing labs/yarn-project.
- `BUILD_CPP=1 scripts/copy_native.sh` => Ensures required cpp code is built (bb and nodejs_module, preset `clang20`) and copies into expected location.

## Integration testing

The focus is on barretenberg/cpp development. Other components need to work with barretenberg changes:

The TypeScript tests below live in the `labs/` submodule (aztec-labs-eng/aztec-node), under `labs/yarn-project`. Build it first with `make labs-yarn-project`. `scripts/labs_env.sh <cmd>` runs `<cmd>` from `labs/` with the right environment. See `labs/yarn-project/CLAUDE.md` for the full test guide.

### labs/yarn-project/end-to-end - E2E tests that verify the full stack

Run end-to-end tests from the root directory:

```bash
# Run specific e2e tests
scripts/labs_env.sh yarn-project/end-to-end/scripts/run_test.sh simple single-node/block-building/block_building
# To run this you CANNOT USE DISABLE_AVM=1. Only run this if the user asks (e.g. 'run the prover full test') You first need to confirm with the user that they want to build without AVM.
scripts/labs_env.sh yarn-project/end-to-end/scripts/run_test.sh simple single-node/prover/server/full
```

### labs/yarn-project IVC integration tests
Run IVC (Incremental Verifiable Computation) integration tests from the root:
```bash
# Run specific IVC tests
scripts/labs_env.sh yarn-project/scripts/run_test.sh ivc-integration/src/chonk_integration.test.ts
scripts/labs_env.sh yarn-project/scripts/run_test.sh ivc-integration/src/chonk_browser.test.ts

# Run rollup IVC tests (with verbose logging)
BB_VERBOSE=1 scripts/labs_env.sh yarn-project/scripts/run_test.sh ivc-integration/src/rollup_ivc_integration.test.ts
```

When making barretenberg changes, ensure these tests still pass.
