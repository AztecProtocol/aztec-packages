# AVM Transpiler

This component transpiles Aztec public contracts code from Noir's Brillig bytecode to AVM (Aztec Virtual Machine) bytecode.

## Build

```
./bootstrap.sh
```

The Makefile target is `make avm-transpiler-native`. The build writes `target/release/avm-transpiler` and `target/release/libavm_transpiler.a`; `bb` links the library.

## Run

```
cargo run <aztec-contract-artifact-json> <transpiled-output-json>
```

Or run the built binary directly: `target/release/avm-transpiler <in.json> <out.json>`.

## Testing Transpiler Changes

The test contract and the AVM simulator tests live in aztec-node, in the `labs` submodule.

1. Build the transpiler (`./bootstrap.sh`) and this tree's nargo (`make noir`). Use `noir/noir-repo/target/release/nargo`, not another nargo.
2. In `labs/noir-projects/noir-contracts` (after `make labs-use-local`), compile only `avm_test_contract`:

   ```
   nargo compile --package avm_test_contract --inliner-aggressiveness=0 --silence-warnings
   ```

3. Transpile the artifact with `target/release/avm-transpiler <in.json> <out.json>`.
4. Rebuild the labs tree with `make fast-labs`. Run the AVM simulator test `labs/yarn-project/end-to-end/src/automine/simulation/avm_simulator.test.ts` through `scripts/labs_env.sh <command>`. To test C++ changes too, rebuild `bb` (`make bb-cpp-native`) and run the AVM proving tests in `labs/yarn-project/bb-prover/src/avm_proving_tests/`.
