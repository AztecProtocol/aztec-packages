# External Audit Scope: Boomerang Value Detection

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: [5824b41fac25d588f13c08578e179d1c4f37f27d](https://github.com/AztecProtocol/aztec-packages/tree/5824b41fac25d588f13c08578e179d1c4f37f27d)

## Files to Audit

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `boomerang_value_detection/graph.hpp`
2. `boomerang_value_detection/graph.cpp`

## Summary of Module

The Boomerang Value Detection mechanism performs static analysis on circuit builders to detect under-constrained variables. It constructs a graph representation where variables are vertices and shared gate appearances create edges, then identifies: (1) variables appearing in only one gate (likely under-constrained), and (2) disconnected components in the constraint graph (missing inter-variable constraints). The analyzer includes sophisticated false positive filtering for legitimate auxiliary variables from range checks, lookups, memory operations, and decomposition chains. The name "boomerang" refers to a common circuit bug: taking a value out of the circuit and then returning it without creating an appropriate constraint—like a boomerang that goes out and comes back unchecked.

For detailed documentation, see [`boomerang_value_detection/README.md`](https://github.com/AztecProtocol/aztec-packages/blob/5824b41fac25d588f13c08578e179d1c4f37f27d/barretenberg/cpp/src/barretenberg/boomerang_value_detection/README.md).

## Test Files

### Core Analyzer Tests
1. `boomerang_value_detection/graph_description.test.cpp`
2. `boomerang_value_detection/variable_gates_count.test.cpp`

### Cryptographic Primitives
3. `boomerang_value_detection/graph_description_sha256.test.cpp`
4. `boomerang_value_detection/graph_description_aes128.test.cpp`
5. `boomerang_value_detection/graph_description_blake2s.test.cpp`
6. `boomerang_value_detection/graph_description_blake3s.test.cpp`
7. `boomerang_value_detection/graph_description_poseidon2s_permutation.test.cpp`

### Field Arithmetic and Memory
8. `boomerang_value_detection/graph_description_bigfield.test.cpp`
9. `boomerang_value_detection/graph_description_ram_rom.test.cpp`

### Recursive Verifiers
10. `boomerang_value_detection/graph_description_ultra_recursive_verifier.test.cpp`
11. `boomerang_value_detection/graph_description_merge_recursive_verifier.test.cpp`
12. `boomerang_value_detection/graph_description_goblin.test.cpp`
13. `boomerang_value_detection/graph_description_ipa_recursive.test.cpp`

### Circuit Builders
14. `boomerang_value_detection/graph_description_megacircuitbuilder.test.cpp`
