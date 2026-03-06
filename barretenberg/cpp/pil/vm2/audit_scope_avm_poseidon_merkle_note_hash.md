# External Audit Scope: Poseidon2, Merkle Trees, and Note Hash Tree

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `ab47a6e7754a0cc86278fe9d47c9c8884ca6d363` ([link](https://github.com/AztecProtocol/aztec-packages/tree/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363))

**Prerequisite:** This audit requires understanding of components covered in the "Core Components, ALU, and Bitwise" audit scope (`audit_scope_avm_core_alu_bitwise.md`).

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in the "Core Components, ALU, and Bitwise" audit scope (`audit_scope_avm_core_alu_bitwise.md`). They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

- `precomputed.pil` -- Shared precomputed columns: lookup tables, range selectors, and static AVM parameters.
- `constants_gen.pil` -- Auto-generated protocol constants (tree heights, domain separators, max counts, memory tags, etc.).

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `poseidon2_params.pil`
    - BN254 round constants for the Poseidon2 permutation (64 rounds: 8 full + 56 partial). Constants sourced from `barretenberg/crypto/poseidon2/poseidon2_params.hpp`.
2. `poseidon2_perm.pil`
    - Poseidon2 permutation: transforms 4 input field elements into 4 outputs through 64 rounds of S-boxes, linear layers, and round constant additions. One row per permutation. **Note:** The generated C++ for this relation is replaced by a hand-optimized version (see item 22).
3. `poseidon2_hash.pil`
    - Full Poseidon2 hash over chunked inputs with chained permutation. Multi-row computation: absorbs up to 3 inputs per round, chains permutation state across rounds, and produces a single output hash. Supports variable-length inputs via `input_len`. Depends on `poseidon2_perm.pil` and `precomputed.pil`.
4. `trees/merkle_check.pil`
    - Generic Merkle tree read and write gadget. Proves membership of a leaf against a root (read) and optionally computes the new root after replacing the leaf (write). Processes one sibling node per row, hashing via lookups to `poseidon2_hash`. Depends on `poseidon2_hash.pil` and `precomputed.pil`.
5. `trees/note_hash_tree_check.pil`
    - Note hash tree read and write gadget. Handles siloing (hashing with contract address), nonce computation, and unique note hash derivation via Poseidon2. Dispatches the actual Merkle proof to `merkle_check`. Writes unique note hashes to public inputs. Depends on `merkle_check.pil`, `poseidon2_hash.pil`, `public_inputs.pil`, `constants_gen.pil`, and `precomputed.pil`.
6. `public_inputs.pil` (**limited scope**: only the interactions referenced by `note_hash_tree_check.pil` -- reading the first nullifier and writing note hashes)
    - Public inputs columns. The full public inputs subtrace is out of scope for this audit; only the interface used by the note hash tree check is relevant.

### Simulation (gadgets, events, and libraries)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2`

7. `simulation/gadgets/poseidon2.hpp`
8. `simulation/gadgets/poseidon2.cpp`
    - Poseidon2 simulation gadget: computes permutation and full hash, emits poseidon2 events.
9. `simulation/events/poseidon2_event.hpp`
    - Event structures for Poseidon2 permutation and hash trace rows.
10. `simulation/standalone/pure_poseidon2.hpp`
11. `simulation/standalone/pure_poseidon2.cpp`
    - Standalone Poseidon2 used in fast simulation (no event emission).
12. `simulation/gadgets/merkle_check.hpp`
13. `simulation/gadgets/merkle_check.cpp`
    - Merkle check simulation gadget: computes Merkle proofs (read and write) and emits events.
14. `simulation/events/merkle_check_event.hpp`
    - Event structure for Merkle check trace rows.
15. `simulation/lib/merkle.hpp`
16. `simulation/lib/merkle.cpp`
    - Shared Merkle tree utilities (path computation, root updates) used by the Merkle check gadget.
17. `simulation/gadgets/note_hash_tree_check.hpp`
18. `simulation/gadgets/note_hash_tree_check.cpp`
    - Note hash tree check simulation gadget: handles siloing, uniqueness, and delegates to Merkle check.
19. `simulation/events/note_hash_tree_check_event.hpp`
    - Event structure for note hash tree check trace rows.

### Trace Generation

20. `tracegen/poseidon2_trace.hpp`
21. `tracegen/poseidon2_trace.cpp`
    - Processes Poseidon2 permutation and hash events and populates the corresponding trace columns.
22. `tracegen/merkle_check_trace.hpp`
23. `tracegen/merkle_check_trace.cpp`
    - Processes Merkle check events and populates Merkle check trace columns.
24. `tracegen/note_hash_tree_check_trace.hpp`
25. `tracegen/note_hash_tree_check_trace.cpp`
    - Processes note hash tree check events and populates the trace columns.

### Optimized / Hand-written Relations

26. `optimized/relations/poseidon2_perm_impl.hpp`
    - Hand-optimized `accumulate` function for the Poseidon2 permutation relation. Replaces the auto-generated version to reduce compilation time. This is the actual code used at proving time and must be semantically equivalent to what `poseidon2_perm.pil` would generate.
27. `optimized/relations/poseidon2_perm.hpp`
28. `optimized/relations/poseidon2_perm.cpp`
    - Header and instantiation for the optimized Poseidon2 permutation relation.

### Interfaces and Mocks

29. `simulation/interfaces/poseidon2.hpp`
30. `simulation/interfaces/merkle_check.hpp`
31. `simulation/interfaces/note_hash_tree_check.hpp`
    - Abstract interfaces for the gadgets (used for dependency injection and testing).
32. `simulation/testing/mock_poseidon2.hpp`
33. `simulation/testing/mock_merkle_check.hpp`
34. `simulation/testing/mock_note_hash_tree_check.hpp`
    - Mock implementations used in unit tests.

## Summary of Module

This audit covers the **hashing and Merkle tree layers** of the AVM circuit, from the lowest-level Poseidon2 primitives up through the note hash tree.

The **Poseidon2 permutation** (`poseidon2_perm.pil`) is the cryptographic core: a width-4 permutation over BN254 field elements with 64 rounds (8 full + 56 partial). Each permutation consumes exactly one trace row. Because the generated C++ for this relation is extremely large, a **hand-optimized implementation** (`poseidon2_perm_impl.hpp`) replaces the generated code -- this optimized version is critical to audit for semantic equivalence.

The **Poseidon2 hash** (`poseidon2_hash.pil`) builds on the permutation to implement a full sponge-based hash function. It absorbs up to 3 field elements per permutation round, chains the permutation state across multiple rows, and produces a single output hash. It supports variable-length inputs and is used pervasively for siloing, nonce computation, address derivation, and Merkle hashing.

The **Merkle check** (`merkle_check.pil`) is a generic gadget for proving Merkle tree membership (reads) and computing updated roots (writes). It processes one tree layer per row, looking up Poseidon2 hash for each layer's hash computation. For writes, it computes both the read root (for verification) and the write root (after leaf replacement) in parallel.

The **note hash tree check** (`note_hash_tree_check.pil`) is a higher-level gadget that handles the protocol-specific logic for the note hash tree (an append-only tree). It optionally silos note hashes with the emitter contract address, computes nonces from the first nullifier, and derives unique note hashes -- all via Poseidon2. It then delegates the actual Merkle proof to `merkle_check` and writes the resulting unique note hashes to the public inputs.

The dependency chain is: `poseidon2_params` -> `poseidon2_perm` -> `poseidon2_hash` -> `merkle_check` -> `note_hash_tree_check`.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files (boolean checks, conditional assignment, accumulators, comparisons, etc.), see [VM Circuit Recipes](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/recipes.md).

## Test Files

### Constraint Tests (relation-level)
1. `vm2/constraining/relations/poseidon2.test.cpp`
2. `vm2/constraining/relations/merkle_check.test.cpp`
3. `vm2/constraining/relations/note_hash_tree_check.test.cpp`

### Tracegen Tests
4. `vm2/tracegen/merkle_check_trace.test.cpp`

### Simulation/Gadget Tests
5. `vm2/simulation/gadgets/poseidon2.test.cpp`
6. `vm2/simulation/gadgets/merkle_check.test.cpp`
7. `vm2/simulation/gadgets/note_hash_tree_check.test.cpp`

### Mock Tests
8. `vm2/simulation/testing/mock_poseidon2.test.cpp`
9. `vm2/simulation/testing/mock_merkle_check.test.cpp`
10. `vm2/simulation/testing/mock_note_hash_tree_check.test.cpp`
