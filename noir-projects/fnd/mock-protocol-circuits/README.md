# Mocked protocol circuits

These small circuits mirror the shape of the real kernel and rollup circuits (Chonk client IVC, then the UltraHonk rollup). They let integration tests exercise proving end to end cheaply.

The workspace contains:

- `app-creator`, `app-reader`: mock app circuits.
- `mock-private-kernel-{init,inner,reset,tail}` and `mock-hiding`: mock private kernels.
- `mock-rollup-{tx-base-private,tx-base-public,tx-merge,root}`: mock rollup circuits.
- `mock-types`: shared types.

`../chonk_circuits.json` sets which crates are Chonk apps and which are kernels.

To build, run `./bootstrap.sh`. It runs `../noir-protocol-circuits/bootstrap.sh` with this directory as the working directory, and writes the artifacts to `target/`.

The artifacts are published as `@aztec-foundation/mock-protocol-circuits-artifacts` (see `../mock-protocol-circuits-artifacts/`). aztec-node consumes them in `yarn-project/ivc-integration` (`generate:noir-circuits` in its `package.json`); in this repo that is `labs/yarn-project/ivc-integration` (`labs` is the aztec-node submodule and is not checked out by default), whose README describes the tests.
