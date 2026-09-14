# External Audit Scope: All Tree Subtraces

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)
2. The "Poseidon2, Merkle Trees, and Note Hash Tree" audit scope (`audit_scope_avm_poseidon_merkle_note_hash.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `precomputed.pil` -- Shared precomputed columns: lookup tables, range selectors, and static AVM parameters.
- `constants_gen.pil` -- Auto-generated protocol constants.
- `ff_gt.pil` -- Field greater-than gadget and canonical decomposition. Used by `indexed_tree_check`, `public_data_check`, and `public_data_squash` for low-leaf and leaf-slot ordering validation.

**From "Poseidon2, Merkle Trees, and Note Hash Tree" audit (`audit_scope_avm_poseidon_merkle_note_hash.md`):**
- `poseidon2_params.pil` -- BN254 round constants for the Poseidon2 permutation.
- `poseidon2_perm.pil` -- Poseidon2 permutation (64 rounds, 1 row per permutation).
- `poseidon2_hash.pil` -- Full Poseidon2 hash over chunked inputs with chained permutation.
- `trees/merkle_check.pil` -- Generic Merkle tree read/write gadget.
- `trees/note_hash_tree_check.pil` -- Note hash tree read/write with siloing, nonce computation, and unique note hash derivation.

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `trees/l1_to_l2_message_tree_check.pil`
    - Read-only L1-to-L2 message tree membership check. Given a message hash, leaf index, and tree root, verifies Merkle membership and returns whether the leaf matches. The simplest tree gadget -- read-only, no writes, no siloing. Depends on `merkle_check.pil` and `constants_gen.pil`.
2. `trees/indexed_tree_check.pil`
    - Generic indexed tree read/write gadget. An indexed tree is a Merkle tree with linked-list leaves (value, next_value, next_index). Supports existence checks (low-leaf membership), non-existence proofs (low-leaf validation via FieldGT), and insertions (low-leaf update + new leaf append). Handles optional siloing, failing writes (value already exists), and writes to public inputs. Used for nullifier tree, retrieved bytecodes tree, and written public data slots tree. Depends on `merkle_check.pil`, `ff_gt.pil`, `poseidon2_hash.pil`, `precomputed.pil`, and `public_inputs.pil`.
3. `trees/public_data_check.pil`
    - Public data tree read/write gadget. The public data tree is an indexed tree with (slot, value) leaves. Handles siloing of storage slots with contract addresses, low-leaf validation via FieldGT, read-value extraction, new leaf insertion, clock-sorted write ordering, and squashing of writes for public inputs. Depends on `merkle_check.pil`, `ff_gt.pil`, `poseidon2_hash.pil`, `constants_gen.pil`, `precomputed.pil`, and `public_data_squash.pil`.
4. `trees/public_data_squash.pil`
    - Utility trace for left-squashing public data writes. Sorted by (leaf_slot, clk). For each unique leaf slot, emits the first occurrence to public inputs with the final (last-written) value. Uses FieldGT for leaf slot ordering and precomputed range checks for clock ordering. Depends on `ff_gt.pil` and `precomputed.pil`.
5. `public_inputs.pil` (**limited scope**: only the interactions referenced by tree gadgets -- reading first nullifier, writing note hashes, writing nullifiers, writing public data)
    - Public inputs columns. The full public inputs subtrace is out of scope; only the tree-facing interface is relevant. The public inputs are further constrained on the consumer side by the [AVM circuit public inputs](../../../../../../noir-projects/noir-protocol-circuits/crates/types/src/abis/avm_circuit_public_inputs.nr) definition and the [public base rollup circuit](../../../../../../noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/public_tx_base_rollup.nr).

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `l1_to_l2_message_tree_check_impl.hpp`
- `indexed_tree_check_impl.hpp`
- `public_data_check_impl.hpp`
- `public_data_squash_impl.hpp`

Note: `public_inputs.pil` defines columns and does not have a generated relation file.

## Summary of Module

This audit covers **all tree-related subtraces** in the AVM circuit, building on the Poseidon2 and Merkle foundations established in the prerequisite audits.

The AVM manages five Merkle trees as part of the Aztec protocol state:

1. **Note Hash Tree** (append-only) -- covered in the Poseidon2/Merkle/NoteHash audit.
2. **L1-to-L2 Message Tree** (read-only) -- the simplest tree gadget. Given a claimed message hash, it verifies Merkle membership at a leaf index and returns whether the leaf matches. No writes, no siloing.
3. **Nullifier Tree** (indexed) -- uses `indexed_tree_check` with siloing. Insertions fail if the nullifier already exists (double-spend protection). The "exists" flag is returned to the caller.
4. **Public Data Tree** (indexed, read/write) -- uses `public_data_check` with slot siloing, value reads for existing slots (value = 0 for new slots), value updates for existing leaves, and new leaf insertion for new slots. Writes are clock-sorted and squashed via `public_data_squash` before being committed to public inputs.
5. **Retrieved Bytecodes Tree** and **Written Public Data Slots Tree** (transient indexed trees) -- use `indexed_tree_check` for tracking which bytecodes have been retrieved and which storage slots have been written during a transaction.

The **indexed tree check** (`indexed_tree_check.pil`) is the most complex tree gadget. It implements the linked-list structure of indexed trees: each leaf contains (value, next_value, next_index). Reads perform low-leaf validation to prove existence or non-existence. Writes update the low-leaf pointers and insert a new leaf at the next available index. Field comparisons (via `ff_gt`) ensure correct low-leaf ordering. Optional siloing binds values to their originating contract.

The **public data check** (`public_data_check.pil`) extends the indexed tree pattern with slot-based addressing, protocol vs non-protocol write separation, clock ordering, and write squashing. The companion **public data squash** (`public_data_squash.pil`) deduplicates writes per leaf slot, keeping only the first occurrence (for public input indexing) with the final value (last written).

The dependency chain for components in this audit is:
- `l1_to_l2_message_tree_check` -> `merkle_check`
- `indexed_tree_check` -> `merkle_check` + `ff_gt` + `poseidon2_hash`
- `public_data_check` -> `merkle_check` + `ff_gt` + `poseidon2_hash` + `public_data_squash`
- `public_data_squash` -> `ff_gt`

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md). In particular, see the sections on [Merkle Trees / Tree State](../docs/README.md#merkle-trees--tree-state) and [TX-level traces and tree state](../docs/README.md#tx-level-traces-and-tree-state).

For Aztec protocol background on state management and indexed Merkle trees, see [State Management](https://docs.aztec.network/developers/docs/foundational-topics/state_management) and [Indexed Trees](https://docs.aztec.network/developers/docs/foundational-topics/advanced/storage/indexed_merkle_tree).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/l1_to_l2_message_tree_check.test.cpp`
- `vm2/constraining/relations/indexed_tree_check.test.cpp`
- `vm2/constraining/relations/public_data_tree.test.cpp`
- `vm2/tracegen/indexed_tree_check_trace.test.cpp`
- `vm2/simulation/gadgets/l1_to_l2_message_tree_check.test.cpp`
- `vm2/simulation/gadgets/indexed_tree_check.test.cpp`
- `vm2/simulation/gadgets/public_data_tree_check.test.cpp`
- `vm2/simulation/gadgets/written_public_data_slots_tree_check.test.cpp`
- `vm2/simulation/testing/mock_l1_to_l2_message_tree_check.test.cpp`
- `vm2/simulation/testing/mock_indexed_tree_check.test.cpp`
- `vm2/simulation/testing/mock_written_public_data_slots_tree_check.test.cpp`
- `vm2/constraining/relations/l1_to_l2_message_exists.test.cpp`

