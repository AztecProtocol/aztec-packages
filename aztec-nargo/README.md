## `aztec-nargo`

The `aztec-nargo` utility is packaged with docker and does the following:
1. If the first argument to `aztec-nargo` is not `compile`, it just forwards args to `nargo` and exits.
1. If the first argument _is_ `compile`, it forwards args to `nargo` with some added options (like `--inliner-aggressiveness 0 --show-artifact-paths`)
3. Extracts all artifacts modified by `nargo`
4. Transpiles each artifact using the `avm-transpiler`
5. Generates verification keys for each artifact using `bb` (`barretenberg`'s binary)

Example usage: `aztec-nargo compile`

Note: uses versions of each tool from this repository (`nargo` version is from `../noir`).
