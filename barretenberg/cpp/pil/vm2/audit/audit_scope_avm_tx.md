# External Audit Scope: TX Traces and Calldata

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)
2. The "Poseidon2, Merkle Trees, and Note Hash Tree" audit scope (`audit_scope_avm_poseidon_merkle_note_hash.md`)
3. The "All Tree Subtraces" audit scope (`audit_scope_avm_all_trees.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `precomputed.pil` -- Shared precomputed columns. Used by `tx.pil` (phase selectors, row markers), `calldata.pil` (range check for context ID diff, first_row), and `calldata_hashing.pil` (first_row, trace continuity).
- `constants_gen.pil` -- Auto-generated protocol constants. Used by `tx.pil` (phase constants, limits), `tx_context.pil` (tree/side-effect limits), `calldata_hashing.pil` (domain separator), and `tx_discard.pil`.
- `gt.pil` -- Integer greater-than gadget. Used by `tx.pil` (gas remaining checks).
- `ff_gt.pil` -- Field greater-than gadget. Used by `tx.pil` (fee validation).

**From "Poseidon2, Merkle Trees, and Note Hash Tree" audit (`audit_scope_avm_poseidon_merkle_note_hash.md`):**
- `poseidon2_hash.pil` -- Poseidon2 hash. Used by `tx.pil` (transaction hash verification) and `calldata_hashing.pil` (calldata commitment hash).
- `trees/note_hash_tree_check.pil` -- Note hash tree gadget. Used by `tx.pil` (note hash tree padding phase).

**From "All Tree Subtraces" audit (`audit_scope_avm_all_trees.md`):**
- `trees/indexed_tree_check.pil` -- Indexed tree gadget. Used by `tx.pil` (nullifier tree padding phase).
- `trees/public_data_check.pil` -- Public data tree gadget. Used by `tx.pil` (public data tree padding phase).
- `execution.pil` -- Execution trace. Used by `tx.pil` (dispatching execution phases). The full execution trace is out of scope; only the interface used by tx.pil is relevant.

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `tx.pil`
    - Top-level transaction trace. Manages the 12 TX phases: non-revertible insertions, setup, revertible insertions, app logic, teardown, collect gas, note hash tree padding, nullifier tree padding, public data tree padding, and cleanup. Each phase is a contiguous block of rows with a phase selector. Orchestrates dispatching to execution (setup, app logic, teardown), tree padding (note hash, nullifier, public data), gas collection, and cleanup. Reads/writes TX-level public inputs (transaction fee, gas limits, calldata hash). Handles fee distribution, gas metering across phases, and revert logic (via `tx_discard`). Depends on `public_inputs.pil`, `precomputed.pil`, `constants_gen.pil`, `execution.pil`, `trees/note_hash_tree_check.pil`, `trees/indexed_tree_check.pil`, `trees/public_data_check.pil`, `poseidon2_hash.pil`, `calldata_hashing.pil`, `tx_context.pil`, `tx_discard.pil`, `gt.pil`, and `ff_gt.pil`.
2. `tx_context.pil`
    - TX context virtual gadget (shares rows with the TX trace). Manages tree and side-effect state across TX phases: initializes state from public inputs at the start of the transaction, enforces continuity between consecutive phases, enforces immutability of state that should not change in certain phases, handles revert restoration (restoring state to pre-revert values when a revertible phase fails), and writes final state to public inputs at the end of the transaction. Tracks note hash tree size, nullifier tree size, public data tree size, L2-to-L1 message count, public log count, and unencrypted log hash. Depends on `public_inputs.pil` and `constants_gen.pil`.
3. `tx_discard.pil`
    - TX discard virtual gadget (shares rows with the TX trace). Manages the `discard` column that propagates through revertible phases. When a revertible phase (setup, app logic, teardown) reverts, `discard` is set for all subsequent rows in that phase, causing side-effect writes to be suppressed. Constrains that `discard` can only transition from 0 to 1 (never back), and that non-revertible phases always have `discard = 0`. Depends on `constants_gen.pil`.
4. `calldata.pil`
    - Calldata storage subtrace. Holds one calldata field per row, indexed by a 1-based index and grouped by `context_id`. Constrains index incrementing within a context, context ID continuity and strictly increasing context IDs across calldata instances (via range-checked diff), and latch marking the final row of each context's calldata. Handles empty calldata as a special case (index = 0, latch = 1). Values are hints whose correctness is constrained by `calldata_hashing.pil`. Depends on `precomputed.pil` and `calldata_hashing.pil` (mutual dependency: calldata_hashing looks up into calldata, and calldata includes calldata_hashing).
5. `calldata_hashing.pil`
    - Calldata hashing subtrace. Computes the calldata hash as a Poseidon2 hash over calldata fields prepended with a domain separator. Each row corresponds to a Poseidon2 permutation (3 fields). Handles padding for non-multiple-of-3 field counts. Constrains index ordering, round counting, size consistency, and that the final hash matches the output. For empty calldata, hashes just the domain separator. The output hash and calldata size are looked up by `tx.pil` to match against public inputs. Depends on `calldata.pil`, `precomputed.pil`, `poseidon2_hash.pil`, and `constants_gen.pil`.
6. `public_inputs.pil` (**limited scope**: only the interactions referenced by `tx.pil` and `tx_context.pil` -- reading/writing TX-level public inputs such as transaction fee, gas limits, calldata hash, tree sizes, side-effect counters, and unencrypted log hash)
    - Public inputs columns. The full public inputs subtrace is out of scope; only the TX-facing interface is relevant. The public inputs are further constrained on the consumer side by the [AVM circuit public inputs](../../../../../../noir-projects/noir-protocol-circuits/crates/types/src/abis/avm_circuit_public_inputs.nr) definition and the [public base rollup circuit](../../../../../../noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/public_tx_base_rollup.nr).

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `tx_impl.hpp`
- `tx_context_impl.hpp`
- `tx_discard_impl.hpp`
- `calldata_impl.hpp`
- `calldata_hashing_impl.hpp`

Note: `public_inputs.pil` defines columns and does not have a generated relation file.

## Summary of Module

This audit covers the **transaction-level traces** of the AVM circuit -- the top-level orchestration layer that sequences TX phases and the calldata pipeline that feeds input data into execution.

The **TX trace** (`tx.pil`) is the top-level orchestrator of the AVM circuit. It manages 12 sequential phases that constitute a complete transaction: non-revertible insertions, setup (execution), revertible insertions, app logic (execution), teardown (execution), gas collection, note hash tree padding, nullifier tree padding, public data tree padding, and cleanup. Each phase occupies a contiguous block of rows with a dedicated phase selector. The TX trace dispatches to the execution trace for the three execution phases, dispatches to tree gadgets for the three padding phases, and handles gas metering and fee distribution directly. It reads the calldata hash from `calldata_hashing` and validates it against the public inputs.

The **TX context** (`tx_context.pil`) is a virtual gadget that shares rows with the TX trace. It is responsible for managing the mutable state that flows between phases: tree sizes (note hash, nullifier, public data), side-effect counters (L2-to-L1 messages, public logs), and the unencrypted log hash. It initializes this state from public inputs at the start of the transaction, enforces continuity between phases, enforces immutability where required (e.g., note hash tree size should not change during a non-tree phase), handles revert restoration (snapshotting state before revertible phases and restoring on failure), and writes the final state to public inputs at the end of the transaction.

The **TX discard** (`tx_discard.pil`) is a virtual gadget that shares rows with the TX trace. It manages the `discard` flag that suppresses side-effect writes when a revertible phase reverts. The flag can only transition from 0 to 1 (monotonic), ensuring that once a revert occurs, all subsequent operations in that phase are discarded. Non-revertible phases always have `discard = 0`.

The **calldata** subtrace (`calldata.pil`) stores the raw calldata fields, one per row, grouped by `context_id` with a 1-based index. It constrains index ordering and context ID separation. The values themselves are treated as hints -- their correctness is established by `calldata_hashing.pil`.

The **calldata hashing** subtrace (`calldata_hashing.pil`) computes a Poseidon2 hash commitment over each context's calldata (prepended with a domain separator). It processes 3 fields per row (matching the Poseidon2 permutation width), handles padding for non-multiple-of-3 counts, and constrains that the final hash equals the claimed output. The TX trace looks up the calldata hash and size by context ID and validates them against the transaction's public inputs.

The dependency chain is:
- `calldata` -> `precomputed` + `calldata_hashing` (mutual: calldata_hashing looks up into calldata)
- `calldata_hashing` -> `calldata` + `precomputed` + `poseidon2_hash` + `constants_gen`
- `tx_discard` -> `constants_gen`
- `tx_context` -> `public_inputs` + `constants_gen`
- `tx` -> `public_inputs` + `precomputed` + `constants_gen` + `execution` + `note_hash_tree_check` + `indexed_tree_check` + `public_data_check` + `poseidon2_hash` + `calldata_hashing` + `tx_context` + `tx_discard` + `gt` + `ff_gt`

Note: The execution trace (`execution.pil`) and the individual opcode gadgets dispatched during execution phases are **not** included in this scope. Only the TX-level interface to execution (phase dispatch and gas handoff) is relevant.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md). In particular, see the sections on [Transaction Lifecycle](../docs/README.md#transaction-lifecycle).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/tx.test.cpp`
- `vm2/constraining/relations/tx_context.test.cpp`
- `vm2/constraining/relations/tx_discard.test.cpp`
- `vm2/constraining/relations/calldata_hashing.test.cpp`
- `vm2/tracegen/tx_trace.test.cpp`
- `vm2/tracegen/calldata_trace.test.cpp`
- `vm2/simulation/gadgets/tx_execution.test.cpp`
- `vm2/simulation/gadgets/calldata_hashing.test.cpp`

