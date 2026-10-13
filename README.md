# aztec-packages

The Aztec Foundation repo.

All the packages that make up the [Aztec](https://docs.aztec.network) protocol.

- [**`barretenberg`**](/barretenberg): The ZK prover backend that provides succinct verifiability for Aztec. Also houses the Aztec VM.
- [**`l1-contracts`**](/l1-contracts): Solidity code for the Ethereum contracts that process rollups
- [**`noir-projects`**](/noir-projects): Noir protocol circuits and protocol contracts (`noir-projects/fnd`).
- [**`noir`**](/noir): The Noir compiler, as a submodule of [noir-lang/noir](https://github.com/noir-lang/noir).
- [**`avm-transpiler`**](/avm-transpiler): Transpiles Noir bytecode to AVM bytecode.
- [**`wsdb`**](/wsdb): TypeScript client for the world-state database binary built in `barretenberg`.
- [**`ipc-codegen`**](/ipc-codegen) and [**`ipc-runtime`**](/ipc-runtime): Schema-driven IPC code generator and the transport library it targets.
- [**`protocol/constants-codegen`**](/protocol/constants-codegen): Generates the protocol constants for TypeScript, C++, PIL, Solidity and Rust.

Additionally, the [**`labs`**](https://github.com/aztec-labs-eng/aztec-node) repository is linked as a submodule. Go there for the aztec node, client, Aztec.nr, docs, and deployment infrastructure.

## Releases

The projects in this repo are released via npm ([@aztec-foundation](https://www.npmjs.com/org/aztec-foundation)) and GitHub releases.

## Build

```
./bootstrap.sh install_deps   # install toolchains, then restart your shell
./bootstrap.sh check          # check toolchain versions
./bootstrap.sh                # build with the cache (make fast); ./bootstrap.sh gentle on a laptop
```

Use `make <target>` to build one component. See [CI.md](CI.md) for tests and CI.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development and CI

For a broad overview of the CI system take a look at [CI.md](CI.md).

ci3 script reference: [ci3/README.md](ci3/README.md).
