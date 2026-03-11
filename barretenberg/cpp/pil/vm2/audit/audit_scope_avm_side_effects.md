# External Audit Scope: Side-Effect Traces (Public Logs and L2-to-L1 Messages)

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `precomputed.pil` -- Shared precomputed columns: lookup tables, range selectors, and static AVM parameters.
- `constants_gen.pil` -- Auto-generated protocol constants.
- `gt.pil` -- Integer greater-than gadget. Used by `emit_public_log` for memory bounds checking and log field count validation.
- `ff_gt.pil` -- Field greater-than gadget. Used by `send_l2_to_l1_msg` for recipient address validation.

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `opcodes/emit_public_log.pil`
    - Dedicated multi-row opcode gadget for public log emission. Reads log data from memory (variable-length, up to `FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH` fields) and writes it to public inputs. Generates `PUBLIC_LOG_HEADER_LENGTH + log_size` rows per log emission. Handles four error cases: out-of-bounds memory access, too many log fields, tag mismatch (non-FF values), and static context violation. Uses a multi-row computation pattern with start/end markers, contiguous trace, and remaining-row countdown. Tag mismatch error propagates "upward" from end to start via `seen_wrong_tag` tracking. Memory reads are gated by `error_out_of_bounds`; public input writes are gated by the union of all errors plus discard. Depends on `gt.pil` (for bounds checks), `memory.pil` (for log data reads), `public_inputs.pil` (for log output), `constants_gen.pil`, and `precomputed.pil`.
2. `opcodes/send_l2_to_l1_msg.pil`
    - Virtual gadget (shares rows with the execution trace) for sending L2-to-L1 messages. Validates the recipient is a valid Ethereum address (at most 160 bits) via a lookup into `ff_gt`. Checks the per-transaction L2-to-L1 message limit (`MAX_L2_TO_L1_MSGS_PER_TX`). Writes the recipient, content, and contract address to public inputs. Errors on limit reached, static context, or invalid recipient. Depends on `ff_gt.pil` (for recipient validation), `public_inputs.pil` (for message output), and `constants_gen.pil`.
3. `public_inputs.pil` (**limited scope**: only the interactions referenced by the side-effect gadgets -- writing public logs and writing L2-to-L1 messages)
    - Public inputs columns. The full public inputs subtrace is out of scope; only the interface used by emit_public_log and send_l2_to_l1_msg is relevant. The public inputs are further constrained on the consumer side by the [AVM circuit public inputs](../../../../../../noir-projects/noir-protocol-circuits/crates/types/src/abis/avm_circuit_public_inputs.nr) definition and the [public base rollup circuit](../../../../../../noir-projects/noir-protocol-circuits/crates/rollup-lib/src/tx_base/public_tx_base_rollup.nr).

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `emit_public_log_impl.hpp`
- `send_l2_to_l1_msg_impl.hpp`

Note: `public_inputs.pil` defines columns and does not have a generated relation file.

## Summary of Module

This audit covers **two side-effect subtraces** that write data to the AVM's public inputs: public log emission and L2-to-L1 message sending.

The **emit public log** gadget (`emit_public_log.pil`) is a dedicated multi-row subtrace -- one of the more complex opcode gadgets in the AVM. Each log emission generates `PUBLIC_LOG_HEADER_LENGTH + log_size` rows. The first row (start) receives operands from the execution trace via a permutation and performs bounds and limit checks via lookups into the GT gadget. Subsequent rows read log values from memory and write them (along with a header containing the log length and contract address) to public inputs. The gadget handles four distinct error conditions, with tag mismatch errors requiring a "bottom-up" propagation pattern: the error is detected during memory reads on worker rows, tracked via `seen_wrong_tag`, and propagated back up to the start row at the end of the computation.

The **send L2-to-L1 message** gadget (`send_l2_to_l1_msg.pil`) is a virtual gadget that shares rows with the execution trace (no dedicated subtrace). It validates the recipient address is a valid Ethereum address (at most 160 bits) by looking up into the FieldGT gadget, checks the per-transaction message limit, and writes the message tuple (recipient, content, contract address) to public inputs. It handles three error conditions: limit reached, static context violation, and invalid recipient.

Both gadgets follow the same pattern for public input writes: a selector gates whether the write occurs (no error and no discard), and a lookup into `public_inputs.sel` writes the data at the appropriate index.

The remaining side-effect opcodes -- `emit_nullifier`, `emit_notehash`, `nullifier_exists`, `notehash_exists`, `l1_to_l2_message_exists`, `sload`, and `sstore` -- are opcode-level wrappers that dispatch to tree gadgets covered in the "All Tree Subtraces" audit and are not included in this scope.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/emit_public_log.test.cpp`
- `vm2/constraining/relations/send_l2_to_l1_msg.test.cpp`
- `vm2/simulation/gadgets/emit_public_log.test.cpp`
- `vm2/simulation/testing/mock_emit_public_log.test.cpp`

