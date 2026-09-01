# External Audit Scope: Poseidon2, Merkle Trees, and Note Hash Tree

Commit hash: _TBD_

**Prerequisite:** This audit requires understanding of components covered in the "Core Gadgets" audit scope (`audit_scope_avm_core.md`).

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in the "Core Gadgets" audit scope (`audit_scope_avm_core.md`). They are listed here for context only and do not need to be re-audited.

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
    - Public inputs columns. The full public inputs subtrace is out of scope for this audit; only the interface used by the note hash tree check is relevant. The public inputs are further constrained on the consumer side by the [AVM circuit public inputs](../../../../../../noir-projects/noir-protocol-circuits/crates/types/src/abis/avm_circuit_public_inputs.nr) definition and the [public base rollup circuit](../../../../../../noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/public_tx_base_rollup.nr).

### Optimized / Hand-written Relations

7. `optimized/relations/poseidon2_perm_impl.hpp`
    - Hand-optimized `accumulate` function for the Poseidon2 permutation relation. Replaces the auto-generated version to reduce compilation time. This is the actual code used at proving time and must be semantically equivalent to what `poseidon2_perm.pil` would generate.
8. `optimized/relations/poseidon2_perm.hpp`
9. `optimized/relations/poseidon2_perm.cpp`
    - Header and instantiation for the optimized Poseidon2 permutation relation.

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `poseidon2_hash_impl.hpp`
- `merkle_check_impl.hpp`
- `note_hash_tree_check_impl.hpp`

Note: `poseidon2_perm.pil` is replaced by the hand-optimized relation listed above. `poseidon2_params.pil` and `public_inputs.pil` define columns/constants and do not have generated relation files.

## Summary of Module

This audit covers the **hashing and Merkle tree layers** of the AVM circuit, from the lowest-level Poseidon2 primitives up through the note hash tree.

The **Poseidon2 permutation** (`poseidon2_perm.pil`) is the cryptographic core: a width-4 permutation over BN254 field elements with 64 rounds (8 full + 56 partial). Each permutation consumes exactly one trace row. Because the generated C++ for this relation is extremely large, a **hand-optimized implementation** (`poseidon2_perm_impl.hpp`) replaces the generated code -- this optimized version is critical to audit for semantic equivalence.

The **Poseidon2 hash** (`poseidon2_hash.pil`) builds on the permutation to implement a full sponge-based hash function. It absorbs up to 3 field elements per permutation round, chains the permutation state across multiple rows, and produces a single output hash. It supports variable-length inputs and is used pervasively for siloing, nonce computation, address derivation, and Merkle hashing.

The **Merkle check** (`merkle_check.pil`) is a generic gadget for proving Merkle tree membership (reads) and computing updated roots (writes). It processes one tree layer per row, looking up Poseidon2 hash for each layer's hash computation. For writes, it computes both the read root (for verification) and the write root (after leaf replacement) in parallel.

The **note hash tree check** (`note_hash_tree_check.pil`) is a higher-level gadget that handles the protocol-specific logic for the note hash tree (an append-only tree). It optionally silos note hashes with the emitter contract address, computes nonces from the first nullifier, and derives unique note hashes -- all via Poseidon2. It then delegates the actual Merkle proof to `merkle_check` and writes the resulting unique note hashes to the public inputs.

The dependency chain is: `poseidon2_params` -> `poseidon2_perm` -> `poseidon2_hash` -> `merkle_check` -> `note_hash_tree_check`.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files (boolean checks, conditional assignment, accumulators, comparisons, etc.), see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/poseidon2.test.cpp`
- `vm2/constraining/relations/merkle_check.test.cpp`
- `vm2/constraining/relations/note_hash_tree_check.test.cpp`
- `vm2/tracegen/merkle_check_trace.test.cpp`
- `vm2/simulation/gadgets/poseidon2.test.cpp`
- `vm2/simulation/gadgets/merkle_check.test.cpp`
- `vm2/simulation/gadgets/note_hash_tree_check.test.cpp`
- `vm2/simulation/testing/mock_poseidon2.test.cpp`
- `vm2/simulation/testing/mock_merkle_check.test.cpp`
- `vm2/simulation/testing/mock_note_hash_tree_check.test.cpp`

