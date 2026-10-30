# L1 Artifacts

The `@aztec-foundation/l1-artifacts` package exposes TypeScript-importable artifacts of the L1 contracts. aztec-node `yarn-project` consumes it.

It contains:

- `dest/`: the compiled package: ABIs, bytecode and storage layouts.
- `src/`: the generated TypeScript sources.
- `l1-contracts/`: a self-contained Foundry tree that the runtime forge deploy path uses.
- the `network-defaults.json` export.

`src/`, `dest/` and `l1-contracts/` are generated. They are not in git.

## Usage

`l1-contracts/bootstrap.sh` generates and builds the package in its `build_artifacts` step, after it builds the verifier. To build by hand, run `./bootstrap.sh` in `l1-contracts/`, then `yarn build` in `l1-contracts/l1-artifacts/`.

`l1-contracts/bootstrap.sh release` publishes the package to npm.
