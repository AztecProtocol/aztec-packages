# External Audit Scope: Bytecode Pipeline

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `ab47a6e7754a0cc86278fe9d47c9c8884ca6d363` ([link](https://github.com/AztecProtocol/aztec-packages/tree/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363))

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Components, ALU, and Bitwise" audit scope (`audit_scope_avm_core_alu_bitwise.md`)
2. The "Poseidon2, Merkle Trees, and Note Hash Tree" audit scope (`audit_scope_avm_poseidon_merkle_note_hash.md`)
3. The "All Tree Subtraces" audit scope (`audit_scope_avm_all_trees.md`)
4. The "Derivations, ECC, and Radix Decomposition" audit scope (`audit_scope_avm_derivations_and_ecc.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Components, ALU, and Bitwise" audit (`audit_scope_avm_core_alu_bitwise.md`):**
- `precomputed.pil` -- Shared precomputed columns. Used by `bc_decomposition` (byte range checks), `bc_hashing`, `instr_fetching` (instruction specs, opcode validation, tag validation), and `bc_retrieval`.
- `constants_gen.pil` -- Auto-generated protocol constants. Used by `bc_retrieval`, `bc_hashing`, `instr_fetching`, `contract_instance_retrieval`, and `update_check`.
- `range_check.pil` -- Range check gadget. Used by `instr_fetching` (pc out-of-range check) and `update_check` (metadata decomposition).
- `gt.pil` -- Integer greater-than gadget. Used by `update_check` (timestamp comparison).
- `ff_gt.pil` -- Field greater-than gadget. Used by `contract_instance_retrieval` (protocol contract address range check).

**From "Poseidon2, Merkle Trees, and Note Hash Tree" audit (`audit_scope_avm_poseidon_merkle_note_hash.md`):**
- `poseidon2_hash.pil` -- Poseidon2 hash. Used by `bc_hashing` (bytecode commitment), `update_check` (storage slot derivation, hash verification), and `class_id_derivation` (class ID hash).

**From "All Tree Subtraces" audit (`audit_scope_avm_all_trees.md`):**
- `trees/indexed_tree_check.pil` -- Indexed tree gadget. Used by `bc_retrieval` (retrieved bytecodes tree insertion, new class check) and `contract_instance_retrieval` (deployment nullifier read).
- `trees/public_data_check.pil` -- Public data tree gadget. Used by `update_check` (reading update hash from public data tree).
- `public_inputs.pil` -- Public inputs columns. Used by `update_check` (timestamp read) and `contract_instance_retrieval` (protocol contract derived address read).

**From "Derivations, ECC, and Radix Decomposition" audit (`audit_scope_avm_derivations_and_ecc.md`):**
- `bytecode/address_derivation.pil` -- Contract address derivation. Used by `contract_instance_retrieval` (address derivation lookup).
- `bytecode/class_id_derivation.pil` -- Contract class ID derivation. Used by `bc_retrieval` (class ID verification).

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `bytecode/bc_decomposition.pil`
    - Bytecode decomposition subtrace. Holds the decomposed bytecode as a sliding window of 37 bytes per row, with the current byte range-checked. Constrains byte ordering, bytecode length (via decrementing `bytes_remaining`), and packing of 31-byte chunks into field elements for hashing. Multi-row computation: one row per bytecode byte, with contiguous trace per contract. Depends on `precomputed.pil` (byte range check).
2. `bytecode/bc_hashing.pil`
    - Bytecode hashing subtrace. Computes the bytecode commitment (bytecode_id) as a Poseidon2 hash over packed field elements from `bc_decomposition`. Multi-row computation: one row per Poseidon2 permutation (3 packed fields per row). Handles padding for non-multiple-of-3 field counts. Constrains that the hash output equals the bytecode_id. Depends on `bc_decomposition.pil`, `poseidon2_hash.pil`, `precomputed.pil`, and `constants_gen.pil`.
3. `bytecode/instr_fetching.pil`
    - Instruction fetching subtrace. Fetches an instruction from the bytecode at a given PC, decomposes the instruction bytes into operands (addressing mode, op1-op7) according to the instruction specification. Handles four parsing errors: PC out of range, opcode out of range, instruction out of range (extends beyond bytecode), and tag out of range. One row per unique static instruction. Depends on `bc_decomposition.pil`, `range_check.pil` (PC range check), and `constants_gen.pil`.
4. `bytecode/bc_retrieval.pil`
    - Bytecode retrieval subtrace. Orchestrates the full process of retrieving a bytecode given a contract address: contract instance retrieval (via `contract_instance_retrieval`), class ID derivation (via `class_id_derivation`), and insertion into the retrieved bytecodes tree (via `indexed_tree_check`). Handles two errors: instance not found and too many bytecodes. One row per bytecode retrieval. Depends on `contract_instance_retrieval.pil`, `class_id_derivation.pil`, `indexed_tree_check.pil`, `constants_gen.pil`, and `precomputed.pil`.
5. `bytecode/update_check.pil`
    - Contract upgrade validation gadget. Validates the current class ID by reading the delayed public mutable hash from the public data tree, decomposing the metadata to extract the timestamp of change, and selecting between the pre and post class IDs based on the current timestamp. Handles the case where no update has ever been written (hash is zero). Depends on `poseidon2_hash.pil`, `public_data_check.pil`, `public_inputs.pil`, `range_check.pil`, `gt.pil`, `constants_gen.pil`, and `precomputed.pil`.
6. `bytecode/contract_instance_retrieval.pil`
    - Contract instance retrieval gadget. Proves existence of a deployed contract instance by checking the deployment nullifier (via `indexed_tree_check`), deriving the address (via `address_derivation`), and checking for contract updates (via `update_check`). Handles protocol contracts separately by reading the derived address from public inputs. Forces instance members to zero if the instance doesn't exist. Depends on `address_derivation.pil`, `update_check.pil`, `ff_gt.pil`, `indexed_tree_check.pil`, `public_inputs.pil`, and `constants_gen.pil`.

### Simulation (gadgets, events, and libraries)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2`

**Bytecode Manager (covers bc_retrieval, bc_decomposition, bc_hashing, instr_fetching)**

7. `simulation/gadgets/bytecode_manager.hpp`
8. `simulation/gadgets/bytecode_manager.cpp`
    - Bytecode manager simulation gadget: orchestrates bytecode retrieval, decomposition, hashing, and instruction fetching.
9. `simulation/gadgets/bytecode_hashing.hpp`
10. `simulation/gadgets/bytecode_hashing.cpp`
    - Bytecode hashing simulation gadget: computes the bytecode commitment hash.
11. `simulation/events/bytecode_events.hpp`
    - Event structures for bytecode-related trace rows (decomposition, hashing, retrieval, instruction fetching).

**Update Check**

12. `simulation/gadgets/update_check.hpp`
13. `simulation/gadgets/update_check.cpp`
    - Update check simulation gadget: reads delayed public mutable, verifies hash preimage, resolves current class ID.
14. `simulation/events/update_check.hpp`
    - Event structure for update check trace rows.
15. `simulation/standalone/noop_update_check.hpp`
    - No-op update check for fast simulation (skips update validation).

**Contract Instance Retrieval**

16. `simulation/gadgets/contract_instance_manager.hpp`
17. `simulation/gadgets/contract_instance_manager.cpp`
    - Contract instance manager simulation gadget: handles contract instance retrieval, nullifier checks, address derivation, and update validation.
18. `simulation/events/contract_instance_retrieval_event.hpp`
    - Event structure for contract instance retrieval trace rows.

### Trace Generation

19. `tracegen/bytecode_trace.hpp`
20. `tracegen/bytecode_trace.cpp`
    - Processes bytecode events and populates the bc_decomposition, bc_hashing, bc_retrieval, and instr_fetching trace columns.
21. `tracegen/update_check_trace.hpp`
22. `tracegen/update_check_trace.cpp`
    - Processes update check events and populates the trace columns.
23. `tracegen/contract_instance_retrieval_trace.hpp`
24. `tracegen/contract_instance_retrieval_trace.cpp`
    - Processes contract instance retrieval events and populates the trace columns.

### Interfaces and Mocks

25. `simulation/interfaces/bytecode_manager.hpp`
    - Abstract interface for the bytecode manager.
26. `simulation/interfaces/bytecode_hashing.hpp`
    - Abstract interface for bytecode hashing.
27. `simulation/interfaces/update_check.hpp`
    - Abstract interface for update check.
28. `simulation/interfaces/contract_instance_manager.hpp`
    - Abstract interface for the contract instance manager.
29. `simulation/testing/mock_update_check.hpp`
    - Mock update check implementation used in unit tests.

## Summary of Module

This audit covers the **bytecode pipeline** of the AVM circuit -- the full chain from contract address to executable instructions.

The pipeline consists of six interconnected subtraces:

1. **Bytecode retrieval** (`bc_retrieval.pil`) is the entry point. Given a contract address, it orchestrates contract instance retrieval (nullifier check + address derivation + update check), class ID derivation, and insertion of the class ID into a transient "retrieved bytecodes" indexed tree. It handles instance-not-found and too-many-bytecodes errors.

2. **Update check** (`update_check.pil`) is the most complex gadget in this scope. It handles the contract upgrade mechanism: reading a delayed public mutable hash from the public data tree, verifying the hash preimage (metadata, pre_class_id, post_class_id) via Poseidon2, decomposing the metadata to extract the timestamp of change, and selecting the appropriate class ID based on whether the upgrade has taken effect.

3. **Contract instance retrieval** (`contract_instance_retrieval.pil`) proves a contract exists by checking its deployment nullifier in the nullifier tree. For non-protocol contracts, it validates the address derivation and checks for contract upgrades. For protocol contracts, it reads the derived address from public inputs.

4. **Bytecode decomposition** (`bc_decomposition.pil`) holds the actual bytecode bytes. It uses a 37-byte sliding window, one byte per row, with byte range checks and length tracking. It also packs 31-byte chunks into field elements for hashing.

5. **Bytecode hashing** (`bc_hashing.pil`) computes the bytecode commitment as a Poseidon2 hash over the packed fields from decomposition. Each row corresponds to a Poseidon2 permutation round (3 fields). The final hash must equal the bytecode_id.

6. **Instruction fetching** (`instr_fetching.pil`) reads instruction bytes from the decomposition trace and parses them into operands according to the wire instruction specification in the precomputed table. It handles four parsing errors (PC/opcode/instruction/tag out of range).

The dependency chain is:
- `bc_decomposition` -> `precomputed`
- `bc_hashing` -> `bc_decomposition` + `poseidon2_hash` + `precomputed` + `constants_gen`
- `instr_fetching` -> `bc_decomposition` + `range_check` + `constants_gen`
- `update_check` -> `poseidon2_hash` + `public_data_check` + `public_inputs` + `range_check` + `gt` + `constants_gen` + `precomputed`
- `contract_instance_retrieval` -> `update_check` + `address_derivation` + `ff_gt` + `indexed_tree_check` + `public_inputs` + `constants_gen`
- `bc_retrieval` -> `contract_instance_retrieval` + `class_id_derivation` + `indexed_tree_check` + `constants_gen` + `precomputed`

Note: The `get_contract_instance.pil` opcode (used by the GetContractInstance opcode at execution time) also uses `contract_instance_retrieval` but is an opcode-level wrapper and is **not** included in this scope.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md). In particular, see the sections on [Bytecode Retrieval](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md#bytecode-retrieval).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/recipes.md).

## Test Files

### Constraint Tests (relation-level)
1. `vm2/constraining/relations/bc_decomposition.test.cpp`
2. `vm2/constraining/relations/bc_hashing.test.cpp`
3. `vm2/constraining/relations/bc_retrieval.test.cpp`
4. `vm2/constraining/relations/instr_fetching.test.cpp`
5. `vm2/constraining/relations/update_check.test.cpp`
6. `vm2/constraining/relations/contract_instance_retrieval.test.cpp`

### Tracegen Tests
7. `vm2/tracegen/bytecode_trace.test.cpp`
8. `vm2/tracegen/update_check_trace.test.cpp`
9. `vm2/tracegen/contract_instance_retrieval_trace.test.cpp`

### Simulation/Gadget Tests
10. `vm2/simulation/gadgets/bytecode_manager.test.cpp`
11. `vm2/simulation/gadgets/bytecode_hashing.test.cpp`
12. `vm2/simulation/gadgets/update_check.test.cpp`
13. `vm2/simulation/gadgets/contract_instance_manager.test.cpp`

### Mock Tests
14. `vm2/simulation/testing/mock_update_check.test.cpp`
