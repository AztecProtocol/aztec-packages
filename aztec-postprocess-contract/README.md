## `aztec-postprocess-contract`

The Aztec compilation process consists of two steps:
1. `aztec-nargo` which just forwards all arguments to Noir's `nargo` compiler at the version tied to this version of aztec.
2. `aztec-postprocess-contract` which post-processes the compiled contracts to prepare them for use in the Aztec ecosystem.

### `transpile_contract_and_gen_vks.sh`
This script provides the core functionality behind the `aztec-postprocess-contract` command available via aztec-up. It performs postprocessing on compiled Noir contracts:
1. Finds all contract artifacts in `target` directories
2. Transpiles each artifact using the `avm-transpiler`
3. Generates verification keys for each artifact using `bb` (`barretenberg`'s binary)
4. Caches verification keys to speed up subsequent compilations

Example usage: `aztec-postprocess-contract` (via aztec-up) or directly `./transpile_contract_and_gen_vks.sh`
