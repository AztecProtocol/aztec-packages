THE PROJECT ROOT IS AT ONE LEVEL ABOVE THIS FOLDER. Typically, the repository is at ~/aztec-packages. All advice is from the root.

# Git workflow for barretenberg

**IMPORTANT**: When comparing branches or looking at diffs for barretenberg work, use `origin/merge-train/barretenberg` as the base branch, NOT `master` or `next`. Create new branches off `origin/merge-train/barretenberg` and target PRs to `merge-train/barretenberg`.

Examples:
- `git checkout -b my-branch origin/merge-train/barretenberg` (create a new branch)
- `git diff origin/merge-train/barretenberg...HEAD` (not `git diff master...HEAD`)
- `git log origin/merge-train/barretenberg..HEAD` (not `git log master..HEAD`)
- `gh pr create --base merge-train/barretenberg` (target PRs to merge-train)

**Do NOT include `Co-Authored-By: Claude` lines in commit messages or `Generated with Claude Code` in PR descriptions.**

Barretenberg issues are tracked at `AztecProtocol/barretenberg` (separate repo), not `AztecProtocol/aztec-packages`. PRs go to `AztecProtocol/aztec-packages` but should reference issues from `AztecProtocol/barretenberg`.

Run ./bootstrap.sh at the top-level to be sure the repo fully builds.
Bootstrap scripts can be called with relative paths e.g. ../barretenberg/bootstrap.sh

# Modules

## ts/ => typescript code for bb.js

Bootstrap modes:

- `./bootstrap.sh` => generate TypeScript bindings and build. See package.json for more fine-grained commands.
  Other commands:
- `yarn build:esm` => the quickest way to rebuild, if only changes inside ts/ folder, and only testing yarn-project.
- `BUILD_CPP=1 scripts/copy_native.sh` => Ensures required cpp code is build (bb and nodejs_module) and copies into expected location.

## Integration testing

The focus is on barretenberg/cpp development. Other components need to work with barretenberg changes:

### yarn-project/end-to-end - E2E tests that verify the full stack

Run end-to-end tests from the root directory:

````bash
# Run specific e2e tests
yarn-project/end-to-end/scripts/run_test.sh simple e2e_block_building
# To run this you CANNOT USE DISABLE_AVM=1. Only run this if the user asks (e.g. 'run the prover full test') You first need to confirm with the user that they want to build without AVM.
yarn-project/end-to-end/scripts/run_test.sh simple e2e_prover/full

### yarn-project IVC integration tests
Run IVC (Incremental Verifiable Computation) integration tests from the root:
```bash
# Run specific IVC tests
yarn-project/scripts/run_test.sh ivc-integration/src/native_chonk_integration.test.ts
yarn-project/scripts/run_test.sh ivc-integration/src/wasm_chonk_integration.test.ts
yarn-project/scripts/run_test.sh ivc-integration/src/browser_chonk_integration.test.ts

# Run rollup IVC tests (with verbose logging)
BB_VERBOSE=1 yarn-project/scripts/run_test.sh ivc-integration/src/rollup_ivc_integration.test.ts
````

When making barretenberg changes, ensure these tests still pass.
