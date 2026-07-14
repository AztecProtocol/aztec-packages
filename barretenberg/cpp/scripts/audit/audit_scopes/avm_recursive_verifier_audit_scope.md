# External Audit Scope: avm_recursive_verifier

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### AVM Recursive Verifier Core
1. `vm2/constraining/recursion/recursive_verifier.hpp`
2. `vm2/constraining/recursion/recursive_verifier.cpp`
3. `vm2/constraining/recursion/recursive_flavor.hpp`
4. `vm2/constraining/recursion/recursive_flavor_settings.hpp`
5. `vm2/constraining/recursion/two_layer_avm_recursive_verifier.hpp`

### Flavor Definitions
6. `flavor/mega_avm_flavor.hpp`
7. `flavor/mega_avm_recursive_flavor.hpp`

### ACIR Integration
8. `vm2/dsl/avm2_recursion_constraint.hpp`
9. `vm2/dsl/avm2_recursion_constraint.cpp`
10. `dsl/acir_format/avm2_recursion_constraint.hpp`

## Summary of Module

The AVM recursive verifier implements in-circuit verification of AVM2 proofs using two-layer recursive composition for efficiency. The core recursive verifier (AvmRecursiveVerifier) performs Mega-arithmetized verification of AVM2 proofs with a fixed verification key, implementing sumcheck verification, public input validation through multilinear evaluation, and Shplemini batch opening. The Goblin-based recursive verifier (TwoLayerAvmRecursiveVerifier) provides a two-phase approach: an inner Mega circuit recursively verifies the AVM2 proof and produces a MegaHonk proof plus GoblinAvm proof (ECCVM, Translator), then an outer Ultra circuit verifies both proofs with hash-based consistency checks to ensure proper transfer of verifier inputs between layers. The recursive flavor definitions configure the circuit builder, curve operations (bn254), and commitment scheme (KZG) for the Mega-arithmetized recursive verifier. The ACIR integration layer (avm2_recursion_constraint) provides the interface for Noir programs to trigger AVM2 recursive verification, handling proof deserialization and witness generation for integration with the Ultra circuit builder.

## Test Files
1. `vm2/constraining/recursion/recursive_verifier.test.cpp`
2. `vm2/dsl/avm2_recursion_constraint.test.cpp`

## Security Mechanisms
