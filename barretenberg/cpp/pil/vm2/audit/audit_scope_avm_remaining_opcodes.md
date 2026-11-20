# External Audit Scope: Remaining Opcode Wrappers (Data Copy and GetEnvVar)

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)
2. The "All Tree Subtraces" audit scope (`audit_scope_avm_all_trees.md`)
3. The "TX Traces and Calldata" audit scope (`audit_scope_avm_tx.md`)
4. The "Execution, Memory, and Calls" audit scope (`audit_scope_avm_execution_and_calls.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `precomputed.pil` -- Shared precomputed columns. Used by `data_copy.pil` (range selectors, first_row).
- `constants_gen.pil` -- Auto-generated protocol constants. Used by `data_copy.pil` (memory limits).
- `gt.pil` -- Integer greater-than gadget. Used by `data_copy.pil` (bounds checks, min computation).

**From "TX Traces and Calldata" audit (`audit_scope_avm_tx.md`):**
- `calldata.pil` -- Calldata storage. Used by `data_copy.pil` (reading calldata for top-level CALLDATACOPY).

**From "Execution, Memory, and Calls" audit (`audit_scope_avm_execution_and_calls.md`):**
- `execution.pil` -- Execution trace. Both opcodes in this scope are virtual gadgets dispatched from execution.
- `memory.pil` -- Memory trace. Used by `data_copy.pil` (memory read/write permutations).

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `data_copy.pil`
    - CALLDATACOPY and RETURNDATACOPY dedicated multi-row opcode gadget. Copies data from a parent/child context's memory (or from the calldata trace for top-level calls) into the current context's memory. Multi-row computation: one row per copied field, with simultaneous read and write permutations to memory. Computes data_index_upper_bound as min(data_size, copy_size + copy_offset) to prevent out-of-bounds reads. Handles padding (zero-fill) when fewer source values exist than copy_size. Handles out-of-bounds errors for both source and destination addresses. For top-level CALLDATACOPY, reads from the calldata trace instead of memory. Depends on `memory.pil`, `calldata.pil`, `precomputed.pil`, `constants_gen.pil`, and `gt.pil`.
2. `opcodes/get_env_var.pil`
    - GETENVVAR virtual gadget (shares rows with execution trace). Retrieves environment variables from context columns (ADDRESS, SENDER, TRANSACTIONFEE, ISSTATICCALL, L2GASLEFT, DAGASLEFT) or from public inputs via lookup (CHAINID, VERSION, BLOCKNUMBER, TIMESTAMP, MINFEEPERL2GAS, MINFEEPERDAGAS). Validates the member enum and errors on invalid values. Depends on `public_inputs.pil`.
3. `public_inputs.pil` (**limited scope**: only the interactions referenced by `get_env_var.pil` -- reading global variables such as chain ID, block number, timestamp, and minimum fees)
    - Public inputs columns. The full public inputs subtrace is out of scope; only the interface used by the get_env_var gadget is relevant. The public inputs are further constrained on the consumer side by the [AVM circuit public inputs](../../../../../../noir-projects/noir-protocol-circuits/crates/types/src/abis/avm_circuit_public_inputs.nr) definition and the [public base rollup circuit](../../../../../../noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/public_tx_base_rollup.nr).

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `data_copy_impl.hpp`
- `get_env_var_impl.hpp`

Note: `public_inputs.pil` defines columns and does not have a generated relation file.

## Summary of Module

This audit covers the **remaining opcode wrappers** that are not covered by other audit scopes: data copy operations and environment variable retrieval.

The **data copy** gadget (`data_copy.pil`) is a dedicated multi-row subtrace that implements CALLDATACOPY and RETURNDATACOPY. It is one of the more complex opcode gadgets due to the dual-context memory model: reads come from a source context (parent for calldata, child for returndata) while writes go to the current context. For top-level enqueued calls, CALLDATACOPY reads from the calldata trace instead of memory. The gadget computes the effective number of reads as min(data_size, copy_size + copy_offset) to prevent reading beyond the source data bounds, and pads remaining writes with zeros. It handles out-of-bounds errors for both source and destination address ranges.

The **get_env_var** gadget (`opcodes/get_env_var.pil`) is a virtual gadget that retrieves environment variables. Some variables (ADDRESS, SENDER, etc.) are available directly from the current execution/context row, while others (CHAINID, BLOCKNUMBER, etc.) require a lookup into the public inputs trace. The gadget validates the enum value and errors on invalid requests.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/data_copy.test.cpp`
- `vm2/constraining/relations/get_env_var.test.cpp`
- `vm2/tracegen/opcodes/get_env_var.test.cpp`
- `vm2/simulation/gadgets/data_copy.test.cpp`
- `vm2/simulation/testing/mock_data_copy.test.cpp`

