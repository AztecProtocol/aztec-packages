# ECCVM Builder/Prover Audit Scope

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### ECCVM Core
1. `eccvm/eccvm_builder_types.hpp`
2. `eccvm/eccvm_prover.cpp`
3. `eccvm/eccvm_prover.hpp`

### Op Queue
4. `op_queue/eccvm_row_tracker.hpp`

### Stdlib Goblin Components
5. `stdlib/primitives/bigfield/goblin_field.hpp`
6. `stdlib/primitives/biggroup/biggroup_goblin.hpp`
7. `stdlib/primitives/biggroup/biggroup_goblin_impl.hpp`

## Summary of Module

The ECCVM builder/prover module implements the circuit construction and proof generation for the Elliptic Curve Virtual Machine (ECCVM). The ECCVM is used in Goblin to handle non-native elliptic curve operations efficiently by deferring them to a separate VM. The builder types define the circuit structure and the prover generates proofs of ECCVM execution. The op queue row tracker manages the accumulation of elliptic curve operations, while the stdlib Goblin components (goblin_field and biggroup_goblin) provide circuit-friendly implementations of field arithmetic and group operations specifically optimized for Goblin's deferred execution model.

## Test Files
1. `eccvm/eccvm.test.cpp`
2. `stdlib/primitives/bigfield/bigfield_goblin.test.cpp`
3. `stdlib/primitives/biggroup/biggroup_goblin.test.cpp`

## Security Mechanisms
- ECCVM circuit constraints ensure correctness of elliptic curve operations
- Op queue tracking maintains operation ordering and consistency
- Goblin field and biggroup components provide secure deferred execution of EC operations
