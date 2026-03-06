# External Audit Scope: Side-Effect Traces (Public Logs and L2-to-L1 Messages)

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `ab47a6e7754a0cc86278fe9d47c9c8884ca6d363` ([link](https://github.com/AztecProtocol/aztec-packages/tree/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363))

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Components, ALU, and Bitwise" audit scope (`audit_scope_avm_core_alu_bitwise.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Components, ALU, and Bitwise" audit (`audit_scope_avm_core_alu_bitwise.md`):**
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
    - Public inputs columns. The full public inputs subtrace is out of scope; only the interface used by emit_public_log and send_l2_to_l1_msg is relevant.

### Simulation (gadgets, events, and libraries)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2`

**Emit Public Log**

4. `simulation/gadgets/emit_public_log.hpp`
5. `simulation/gadgets/emit_public_log.cpp`
    - Emit public log simulation gadget: reads log data from memory, validates tags and bounds, emits events for trace generation.
6. `simulation/events/emit_public_log_event.hpp`
    - Event structure for emit public log trace rows.

**Send L2-to-L1 Message**

Note: `send_l2_to_l1_msg` is a virtual gadget that shares rows with the execution trace. Its simulation logic lives in the execution gadget (`simulation/gadgets/execution.cpp`, method `send_l2_to_l1_msg`). There is no dedicated simulation gadget or event type; the execution event captures the L2-to-L1 message columns. For this audit, only the `send_l2_to_l1_msg` method within the execution gadget is relevant -- the rest of the execution gadget is out of scope.

7. `simulation/gadgets/execution.hpp` (**limited scope**: only the `send_l2_to_l1_msg` method declaration and related members)
8. `simulation/gadgets/execution.cpp` (**limited scope**: only the `send_l2_to_l1_msg` method implementation)

### Trace Generation

9. `tracegen/opcodes/emit_public_log_trace.hpp`
10. `tracegen/opcodes/emit_public_log_trace.cpp`
    - Processes emit public log events and populates the emit_public_log trace columns.

Note: `send_l2_to_l1_msg` trace generation is handled by the execution trace builder (`tracegen/execution_trace.cpp`) since it is a virtual gadget. For this audit, only the send_l2_to_l1_msg-related logic within the execution trace builder is relevant.

11. `tracegen/execution_trace.hpp` (**limited scope**: only send_l2_to_l1_msg-related trace generation)
12. `tracegen/execution_trace.cpp` (**limited scope**: only send_l2_to_l1_msg-related trace generation)

### Interfaces and Mocks

13. `simulation/interfaces/emit_public_log.hpp`
    - Abstract interface for the emit public log gadget.
14. `simulation/testing/mock_emit_public_log.hpp`
    - Mock implementation used in unit tests.

## Summary of Module

This audit covers **two side-effect subtraces** that write data to the AVM's public inputs: public log emission and L2-to-L1 message sending.

The **emit public log** gadget (`emit_public_log.pil`) is a dedicated multi-row subtrace -- one of the more complex opcode gadgets in the AVM. Each log emission generates `PUBLIC_LOG_HEADER_LENGTH + log_size` rows. The first row (start) receives operands from the execution trace via a permutation and performs bounds and limit checks via lookups into the GT gadget. Subsequent rows read log values from memory and write them (along with a header containing the log length and contract address) to public inputs. The gadget handles four distinct error conditions, with tag mismatch errors requiring a "bottom-up" propagation pattern: the error is detected during memory reads on worker rows, tracked via `seen_wrong_tag`, and propagated back up to the start row at the end of the computation.

The **send L2-to-L1 message** gadget (`send_l2_to_l1_msg.pil`) is a virtual gadget that shares rows with the execution trace (no dedicated subtrace). It validates the recipient address is a valid Ethereum address (at most 160 bits) by looking up into the FieldGT gadget, checks the per-transaction message limit, and writes the message tuple (recipient, content, contract address) to public inputs. It handles three error conditions: limit reached, static context violation, and invalid recipient.

Both gadgets follow the same pattern for public input writes: a selector gates whether the write occurs (no error and no discard), and a lookup into `public_inputs.sel` writes the data at the appropriate index.

The remaining side-effect opcodes -- `emit_nullifier`, `emit_notehash`, `nullifier_exists`, `notehash_exists`, `l1_to_l2_message_exists`, `sload`, and `sstore` -- are opcode-level wrappers that dispatch to tree gadgets covered in the "All Tree Subtraces" audit and are not included in this scope.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/recipes.md).

## Test Files

### Constraint Tests (relation-level)
1. `vm2/constraining/relations/emit_public_log.test.cpp`
2. `vm2/constraining/relations/send_l2_to_l1_msg.test.cpp`

### Simulation/Gadget Tests
3. `vm2/simulation/gadgets/emit_public_log.test.cpp`

### Mock Tests
4. `vm2/simulation/testing/mock_emit_public_log.test.cpp`
