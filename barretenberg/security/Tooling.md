# Security Tooling

## Boomerang value detection

Taking the value out of the circuit and then returning it without creating an appropriate constraint is a common bug. To detect such issues in our codebase we've created boomerang detection static analysis tool. It automatically detects variables in one gate and filters out false positives. It can also detect if a circuit has several subgraphs that are not connected with any constraints, which can also be a marker of a bug.

For detailed documentation, see the [Boomerang Value Detection README](../cpp/src/barretenberg/boomerang_value_detection/README.md).

## Origin Tags

Origin tags are used to track the provenance of values within the transcript. They are used to detect common pitfalls such as using a free witness in an inappropriate context.

You can find more information in the [Origin Tags Security Mechanism](../cpp/src/barretenberg/transcript/Origin Tags Security.md) file.


## Fuzzing

The [Fuzzing guide](../cpp/docs/Fuzzing.md) covers building and running the fuzzers, including the ones for the standard circuit primitives.

The Solidity verifier is fuzzed through Foundry tests; `../sol/scripts/run_fuzzer.sh` generates their proofs with `honk_solidity_proof_gen`.

### Multi-Field Fuzzer

The multi-field fuzzer is a specialized security testing tool designed to validate the correctness of native field implementation

You can find detailed information in the [Multi-Field Fuzzer README](../cpp/src/barretenberg/ecc/curves/Fuzzing.md) file.

### ECCVM Fuzzer

The ECCVM fuzzer is a dedicated tool for testing the security and correctness of the ECCVM implementation.

You can find more information in the [ECCVM Fuzzer README](../cpp/src/barretenberg/eccvm/README_FUZZERS.md) file.

## Formal and static checks

- [ACIR formal proofs](../cpp/src/barretenberg/acir_formal_proofs/README.md): SMT-based proofs that ACIR opcodes are constrained correctly.
- [SMT verification](../cpp/src/barretenberg/smt_verification/README.md): the SMT circuit-checking library behind them.
- `../cpp/src/barretenberg/acir_components_check/`: maps each ACIR witness to its circuit-side component and compares the components per ACIR connected component.
