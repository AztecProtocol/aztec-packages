# External Audit Scope: Tree and Side-Effect Opcode Wrappers

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)
2. The "Poseidon2, Merkle Trees, and Note Hash Tree" audit scope (`audit_scope_avm_poseidon_merkle_note_hash.md`)
3. The "All Tree Subtraces" audit scope (`audit_scope_avm_all_trees.md`)
4. The "Bytecode Pipeline" audit scope (`audit_scope_avm_bytecode.md`)
5. The "Execution, Memory, and Calls" audit scope (`audit_scope_avm_execution_and_calls.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `constants_gen.pil` -- Auto-generated protocol constants. Used by all opcode wrappers in this scope (limits, tag constants).
- `range_check.pil` -- Range check gadget. Used by `opcodes/emit_notehash.pil`, `opcodes/notehash_exists.pil`, and `opcodes/l1_to_l2_message_exists.pil` (leaf index range checks).
- `gt.pil` -- Integer greater-than gadget. Used by `opcodes/notehash_exists.pil` and `opcodes/l1_to_l2_message_exists.pil` (leaf index in-range checks).

**From "Poseidon2, Merkle Trees, and Note Hash Tree" audit (`audit_scope_avm_poseidon_merkle_note_hash.md`):**
- `trees/note_hash_tree_check.pil` -- Note hash tree gadget. Used by `opcodes/emit_notehash.pil` (tree append) and `opcodes/notehash_exists.pil` (membership check).

**From "All Tree Subtraces" audit (`audit_scope_avm_all_trees.md`):**
- `trees/indexed_tree_check.pil` -- Indexed tree gadget. Used by `opcodes/emit_nullifier.pil` (nullifier write), `opcodes/nullifier_exists.pil` (existence check), and `opcodes/sstore.pil` (written slots tracking).
- `trees/public_data_check.pil` -- Public data tree gadget. Used by `opcodes/sload.pil` (storage read) and `opcodes/sstore.pil` (storage write).
- `trees/l1_to_l2_message_tree_check.pil` -- L1-to-L2 message tree gadget. Used by `opcodes/l1_to_l2_message_exists.pil` (membership check).

**From "Bytecode Pipeline" audit (`audit_scope_avm_bytecode.md`):**
- `bytecode/contract_instance_retrieval.pil` -- Contract instance retrieval. Used by `opcodes/get_contract_instance.pil` (instance lookup).

**From "Execution, Memory, and Calls" audit (`audit_scope_avm_execution_and_calls.md`):**
- `execution.pil` -- Execution trace. All opcodes in this scope are virtual gadgets that share rows with the execution trace and are dispatched from it.
- `memory.pil` -- Memory trace. Used by `opcodes/get_contract_instance.pil` (memory writes).

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `opcodes/emit_nullifier.pil`
    - EMITNULLIFIER virtual gadget. Writes a nullifier to the nullifier tree via indexed_tree_check lookup. Validates against per-TX nullifier limit. Errors on limit reached, static context, or nullifier collision. Depends on `constants_gen.pil`.
2. `opcodes/emit_notehash.pil`
    - EMITNOTEHASH virtual gadget. Appends a note hash to the note hash tree via note_hash_tree_check lookup. Siloes the note hash with the contract address using range_check for the counter. Validates against per-TX note hash limit. Errors on limit reached or static context. Depends on `constants_gen.pil`, `range_check.pil`, and `trees/note_hash_tree_check.pil`.
3. `opcodes/nullifier_exists.pil`
    - NULLIFIEREXISTS virtual gadget. Checks if a siloed nullifier exists in the nullifier tree via indexed_tree_check lookup. Writes the boolean result to the output register. Depends on `constants_gen.pil`.
4. `opcodes/notehash_exists.pil`
    - NOTEHASHEXISTS virtual gadget. Checks if a note hash exists at a given leaf index in the note hash tree via note_hash_tree_check lookup. Validates leaf index is in range via GT lookup. Writes the boolean result to the output register. Depends on `constants_gen.pil`, `range_check.pil`, `trees/note_hash_tree_check.pil`, and `gt.pil`.
5. `opcodes/l1_to_l2_message_exists.pil`
    - L1TOL2MESSAGEEXISTS virtual gadget. Checks if an L1-to-L2 message exists at a given leaf index in the message tree via l1_to_l2_message_tree_check lookup. Validates leaf index is in range via GT lookup. Writes the boolean result to the output register. Depends on `constants_gen.pil`, `range_check.pil`, `trees/l1_to_l2_message_tree_check.pil`, and `gt.pil`.
6. `opcodes/sload.pil`
    - SLOAD virtual gadget. Reads a value from storage at a given slot via public_data_check lookup. The slot is siloed with the contract address by the public_data_check gadget. Writes the retrieved value to the output register. Depends on `constants_gen.pil` and `trees/public_data_check.pil`.
7. `opcodes/sstore.pil`
    - SSTORE virtual gadget. Writes a value to storage at a given slot via public_data_check lookup. Tracks written slots via indexed_tree_check for dynamic gas calculation (first write vs. subsequent write). Validates against per-TX data write limit. Errors on limit reached or static context. Depends on `constants_gen.pil`, `trees/public_data_check.pil`, and `trees/indexed_tree_check.pil`.
8. `opcodes/get_contract_instance.pil`
    - GETCONTRACTINSTANCE dedicated opcode gadget. Retrieves a contract instance by address via contract_instance_retrieval lookup. Validates member enum, performs out-of-bounds checking, selects the requested member (deployer, class_id, init_hash), and writes the exists flag and member value to memory. Depends on `bytecode/contract_instance_retrieval.pil`.

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `emit_nullifier_impl.hpp`
- `emit_notehash_impl.hpp`
- `nullifier_exists_impl.hpp`
- `notehash_exists_impl.hpp`
- `l1_to_l2_message_exists_impl.hpp`
- `sload_impl.hpp`
- `sstore_impl.hpp`
- `get_contract_instance_impl.hpp`

## Summary of Module

This audit covers the **tree and side-effect opcode wrappers** -- the PIL gadgets that bridge between the execution trace and the tree/side-effect subtraces audited in prior scopes.

These opcodes are all **virtual gadgets** that share rows with the execution trace. They are dispatched by the execution trace when the corresponding opcode is reached, and they interact with the underlying tree gadgets via lookups.

**EMITNULLIFIER** (`emit_nullifier.pil`) writes a new nullifier to the nullifier tree, checking the per-TX limit and static context. **EMITNOTEHASH** (`emit_notehash.pil`) appends a siloed note hash to the note hash tree with similar limit and static checks.

**NULLIFIEREXISTS** (`nullifier_exists.pil`) checks nullifier existence in the nullifier tree. **NOTEHASHEXISTS** (`notehash_exists.pil`) checks note hash existence at a specific leaf index, with a range check to ensure the index is valid. **L1TOL2MESSAGEEXISTS** (`l1_to_l2_message_exists.pil`) checks message existence similarly.

**SLOAD** (`sload.pil`) reads from the public data tree. **SSTORE** (`sstore.pil`) writes to the public data tree, additionally tracking written slots for dynamic gas computation and enforcing the data write limit.

**GETCONTRACTINSTANCE** (`get_contract_instance.pil`) is the only dedicated (non-virtual) opcode gadget in this scope. It retrieves a contract instance by address, validates the member enum, and writes the exists flag and selected member to memory.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/emit_nullifier.test.cpp`
- `vm2/constraining/relations/emit_notehash.test.cpp`
- `vm2/constraining/relations/nullifier_exists.test.cpp`
- `vm2/constraining/relations/notehash_exists.test.cpp`
- `vm2/constraining/relations/l1_to_l2_message_exists.test.cpp`
- `vm2/constraining/relations/get_contract_instance.test.cpp`
- `vm2/tracegen/opcodes/get_contract_instance_trace.test.cpp`
- `vm2/simulation/testing/mock_get_contract_instance.test.cpp`

