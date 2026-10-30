# External Audit Scope: avm_recursive_verifier

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: set when the audit starts. File list checked against `a18e6e7` (branch `v6`).

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### AVM Recursive Verifier Core
1. `vm2/constraining/recursion/recursive_verifier.hpp`
2. `vm2/constraining/recursion/recursive_verifier.cpp`
3. `vm2/constraining/recursion/recursive_flavor.hpp`
4. `vm2/constraining/recursion/two_layer_avm_recursive_verifier.hpp`

### Flavor Definitions
5. `flavor/mega_avm_flavor.hpp`
6. `flavor/mega_avm_recursive_flavor.hpp`

### ACIR Integration
7. `vm2/dsl/avm2_recursion_constraint.hpp`
8. `vm2/dsl/avm2_recursion_constraint.cpp`
9. `dsl/acir_format/avm2_recursion_constraint.hpp`

## Summary of Module

The AVM recursive verifier implements in-circuit verification of AVM2 proofs using two-layer recursive composition for efficiency.

- **Core verifier.** `AvmRecursiveVerifier` performs Mega-arithmetized verification of AVM2 proofs with a fixed verification key. It implements sumcheck verification, public input validation through multilinear evaluation, and Shplemini batch opening. The recursive flavor definitions configure the circuit builder, curve operations (bn254), and commitment scheme (KZG) for this verifier.
- **Two-layer verifier.** `TwoLayerAvmRecursiveVerifier` is Goblin-based and has two phases. An inner Mega circuit recursively verifies the AVM2 proof and produces a MegaHonk proof plus a GoblinAvm proof (ECCVM, Translator). An outer Ultra circuit verifies both proofs, with hash-based consistency checks on the verifier inputs passed between layers.
- **ACIR integration.** `avm2_recursion_constraint` lets Noir programs trigger AVM2 recursive verification. It handles proof deserialization and witness generation for the Ultra circuit builder.

Documentation: `vm2/constraining/recursion/TWO_LAYER_AVM_RECURSIVE_VERIFIER.md`.

## Test Files
1. `vm2/constraining/recursion/recursive_verifier.test.cpp`
2. `vm2/dsl/avm2_recursion_constraint.test.cpp`

## Security Mechanisms
1. `vm2/constraining/recursion/graph_description_two_layer_avm_recursive_verifier.test.cpp`
   - Boomerang value detection for the two-layer verifier
2. `boomerang_value_detection/graph_description_goblin_avm.test.cpp`
   - Boomerang value detection for the Goblin AVM verifier
