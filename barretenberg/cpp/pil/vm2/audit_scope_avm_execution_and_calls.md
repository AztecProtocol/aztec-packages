# External Audit Scope: Execution, Memory, and Calls

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `ab47a6e7754a0cc86278fe9d47c9c8884ca6d363` ([link](https://github.com/AztecProtocol/aztec-packages/tree/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363))

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Components, ALU, and Bitwise" audit scope (`audit_scope_avm_core_alu_bitwise.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Components, ALU, and Bitwise" audit (`audit_scope_avm_core_alu_bitwise.md`):**
- `precomputed.pil` -- Shared precomputed columns. Used by `execution.pil` (instruction specs, opcode dispatch), `execution/addressing.pil` (addressing mode lookup), `execution/gas.pil` (addressing gas lookup), `memory.pil` (range check tables, tag parameters), and `internal_call_stack.pil` (first_row).
- `constants_gen.pil` -- Auto-generated protocol constants. Used by `execution/addressing.pil` (memory limits), `execution/gas.pil` (gas constants), and `memory.pil` (tag constants).
- `range_check.pil` -- Range check gadget. Used by `memory.pil` (address ordering, write range check) and `execution/addressing.pil` (overflow checks).
- `gt.pil` -- Integer greater-than gadget. Used by `execution/gas.pil` (gas limit comparison), `execution/addressing.pil` (bounds checks), and `opcodes/external_call.pil` (gas clamping).
- `alu.pil` -- Arithmetic/comparison operations. Used by `execution.pil` (ALU dispatch).
- `bitwise.pil` -- Bitwise AND/OR/XOR. Used by `execution.pil` (bitwise dispatch).

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `execution.pil`
    - Main execution trace. One row per instruction executed. Manages the instruction lifecycle through temporality groups: bytecode retrieval, instruction fetching, addressing resolution, register reads, gas check, opcode dispatch, register writes, and PC update. Dispatches to ALU, bitwise, and all dedicated/virtual gadgets via selector-gated lookups/permutations. Handles enqueued call boundaries (start/end), clock counter, selector deactivation cascade, and error consolidation. Depends on virtually every other PIL file (includes all opcode files, gadgets, and trees).
2. `execution/addressing.pil`
    - Address resolution virtual gadget (shares rows with execution trace). Resolves raw operands from instruction fetching into resolved operands (rop): handles immediate values, relative addressing, and indirect addressing. Performs memory reads for indirection via the memory trace. Handles three error types: base address failure, relative overflow, and invalid tag on indirect resolution. Depends on `memory.pil`, `precomputed.pil`, `constants_gen.pil`, and `gt.pil`.
3. `execution/registers.pil`
    - Register file virtual gadget (shares rows with execution trace). Manages memory reads (before opcode execution) and writes (after opcode execution) for up to 6 registers per instruction. Reads include tag checking; writes cannot fail. Each register operation becomes a permutation into the memory trace. Depends on `memory.pil`.
4. `execution/gas.pil`
    - Gas metering virtual gadget (shares rows with execution trace). Computes total gas used (base + dynamic) for L2 and DA gas, compares against gas limits via GT lookups, and sets out-of-gas flag. Base gas includes opcode gas plus addressing gas (looked up by addressing mode). Dynamic gas is gas spec multiplied by a dynamic factor. Depends on `precomputed.pil`, `gt.pil`, `execution.pil`, and `context.pil`.
5. `execution/discard.pil`
    - Execution-level discard virtual gadget (shares rows with execution trace). Manages the `discard` and `dying_context_id` columns that track whether the current context or an ancestor has failed. Propagates discard state across rows with lifting conditions for enqueued call boundaries, dying context resolution, and nested calls from undiscarded contexts. Depends on `execution.pil`.
6. `memory.pil`
    - Memory subtrace. One row per memory access (read or write), sorted by (space_id, address, clk, rw). Enforces correct ordering via range-checked differences, initialization (first read returns 0 with FF tag), read-write consistency (reads return most recent write), and write range checking (non-FF writes are range-checked against the tag's bit width). Depends on `constants_gen.pil`, `precomputed.pil`, and `range_check.pil`.
7. `context.pil`
    - Execution context virtual gadget (shares rows with execution trace). Manages context state (context_id, parent_id, pc, msg_sender, contract_address, bytecode_id, is_static, gas limits, gas used, calldata/returndata pointers, tree state). Handles context propagation on normal instructions, context creation on CALL/STATICCALL (pushing to context stack), and context restoration on RETURN/REVERT (popping from context stack). Depends on `context_stack.pil`, `execution.pil`, and `opcodes/internal_call.pil`.
8. `context_stack.pil`
    - Context stack subtrace. Stores saved context state when entering nested calls. One row per CALL/STATICCALL. Active rows are defined by a permutation from context.pil on call entry; return/revert lookups read from this stack using the `sel` selector. Stores context_id, parent_id, pc, gas limits/used, tree roots/sizes, and side-effect counters. No dependencies on other PIL files.
9. `opcodes/external_call.pil`
    - CALL/STATICCALL gas clamping virtual gadget (shares rows with execution trace). Computes remaining gas for each dimension (L2, DA), clamps allocated gas to remaining gas via GT lookups, and sets the gas limits for the new context. Most call/staticcall constraints are in context.pil; this file only handles gas clamping. Depends on `execution.pil` and `gt.pil`.
10. `internal_call_stack.pil`
    - Internal call stack subtrace. Stores return PC and context information when INTERNALCALL is executed. Active rows defined by permutation from internal_call.pil; INTERNALRETURN reads from this stack via lookup. Stores context_id, call_id, entered_call_id, return_call_id, and return_pc. Depends on `precomputed.pil`.
11. `opcodes/internal_call.pil`
    - INTERNALCALL/INTERNALRETURN virtual gadget (shares rows with execution trace). Manages internal call IDs, pushes to and pops from the internal call stack, constrains PC on return. Handles empty-stack error on INTERNALRETURN. Depends on `execution.pil`, `context.pil`, and `internal_call_stack.pil`.

### Simulation (gadgets, events, and libraries)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2`

**Execution**

12. `simulation/gadgets/execution.hpp`
13. `simulation/gadgets/execution.cpp`
    - Execution simulation gadget: runs the instruction loop (fetch, decode, execute), dispatches to sub-gadgets, manages context, and emits execution events.
14. `simulation/gadgets/execution_components.hpp`
15. `simulation/gadgets/execution_components.cpp`
    - Execution components: shared helper logic used by the execution gadget (e.g., addressing resolution, register handling).
16. `simulation/events/execution_event.hpp`
    - Event structure for execution trace rows (one event per instruction).
17. `simulation/events/addressing_event.hpp`
    - Event structure for addressing resolution trace rows.

**Memory**

18. `simulation/gadgets/memory.hpp`
19. `simulation/gadgets/memory.cpp`
    - Memory simulation gadget: tracks memory state per space_id, handles reads/writes, and emits memory events.
20. `simulation/events/memory_event.hpp`
21. `simulation/events/memory_event.cpp`
    - Event structure for memory trace rows.

**Context**

22. `simulation/gadgets/context.hpp`
23. `simulation/gadgets/context.cpp`
    - Context simulation gadget: manages execution context state, call/return/revert transitions.
24. `simulation/gadgets/context_provider.hpp`
25. `simulation/gadgets/context_provider.cpp`
    - Context provider: creates and manages context objects for the execution gadget.
26. `simulation/events/context_events.hpp`
    - Event structures for context and context stack trace rows.

### Trace Generation

27. `tracegen/execution_trace.hpp`
28. `tracegen/execution_trace.cpp`
    - Processes execution events and populates the execution, addressing, registers, gas, discard, context, external_call, and internal_call trace columns.
29. `tracegen/memory_trace.hpp`
30. `tracegen/memory_trace.cpp`
    - Processes memory events, sorts them, and populates the memory trace columns.

### Interfaces and Mocks

31. `simulation/interfaces/execution.hpp`
32. `simulation/interfaces/execution_components.hpp`
33. `simulation/interfaces/memory.hpp`
34. `simulation/interfaces/context.hpp`
35. `simulation/interfaces/context_provider.hpp`
    - Abstract interfaces for the gadgets.
36. `simulation/testing/mock_execution.hpp`
37. `simulation/testing/mock_execution_components.hpp`
38. `simulation/testing/mock_execution_id_manager.hpp`
39. `simulation/testing/mock_memory.hpp`
40. `simulation/testing/mock_context.hpp`
41. `simulation/testing/mock_context_provider.hpp`
    - Mock implementations used in unit tests.
42. `simulation/standalone/hybrid_execution.hpp`
43. `simulation/standalone/hybrid_execution.cpp`
    - Hybrid execution for mixed fast/witness-generation mode.
44. `simulation/standalone/pure_execution_components.hpp`
45. `simulation/standalone/pure_execution_components.cpp`
    - Standalone execution components for fast simulation (no event emission).

## Summary of Module

This audit covers the **execution infrastructure** of the AVM circuit -- the core machinery that fetches, decodes, and executes instructions, manages memory, and handles nested calls.

The **execution trace** (`execution.pil`) is the central hub of the AVM. Each row represents one instruction executed. It orchestrates a pipeline of temporality groups: (1) bytecode retrieval for the first instruction in each context, (2) instruction fetching to decode the opcode and operands, (3) address resolution to handle indirect/relative addressing, (4) register reads from memory, (5) gas checking, (6) opcode dispatch to the appropriate gadget (ALU, bitwise, or dedicated subtrace), (7) register writes back to memory, and (8) PC update. The execution trace also manages enqueued call boundaries and consolidates errors from all stages.

The **addressing** gadget (`execution/addressing.pil`) resolves raw operands into usable values: immediates pass through unchanged, while address operands go through relative resolution (adding a base address), indirection (memory read), and validation at each step.

The **registers** gadget (`execution/registers.pil`) bridges execution and memory for up to 6 register operands per instruction, handling both reads (with tag checks) and writes.

The **gas** gadget (`execution/gas.pil`) computes per-instruction gas consumption (base gas from opcode + addressing mode, plus dynamic gas) and compares against the context's gas limits.

The **execution discard** gadget (`execution/discard.pil`) tracks whether the current execution context is in a "discarding" state due to an ancestor or self-failure, propagating this state across instructions.

The **memory** subtrace (`memory.pil`) is the AVM's memory model. It records all memory accesses sorted by address and timestamp, enforcing initialization, read-write consistency, and tag-based range checking on writes.

The **context** gadget (`context.pil`) manages execution context state across instructions: propagating context on normal flow, creating new contexts on CALL/STATICCALL, and restoring parent contexts on RETURN/REVERT.

The **context stack** (`context_stack.pil`) stores saved parent context state during nested calls, enabling restoration on return or revert.

The **external call** gadget (`opcodes/external_call.pil`) handles gas clamping for CALL/STATICCALL: ensuring the allocated gas does not exceed the remaining gas.

The **internal call stack** (`internal_call_stack.pil`) and **internal call** gadget (`opcodes/internal_call.pil`) manage INTERNALCALL/INTERNALRETURN within a single context, tracking return addresses and call IDs.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md). In particular, see the sections on [Execution](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md#execution) and [Memory](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md#memory).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/recipes.md).

## Test Files

### Constraint Tests (relation-level)
1. `vm2/constraining/relations/execution.test.cpp`
2. `vm2/constraining/relations/execution_discard.test.cpp`
3. `vm2/constraining/relations/addressing.test.cpp`
4. `vm2/constraining/relations/registers.test.cpp`
5. `vm2/constraining/relations/gas.test.cpp`
6. `vm2/constraining/relations/memory.test.cpp`
7. `vm2/constraining/relations/context.test.cpp`
8. `vm2/constraining/relations/context_stack.test.cpp`
9. `vm2/constraining/relations/internal_call.test.cpp`

### Tracegen Tests
10. `vm2/tracegen/execution_trace.test.cpp`
11. `vm2/tracegen/memory_trace.test.cpp`

### Simulation/Gadget Tests
12. `vm2/simulation/gadgets/execution.test.cpp`

### Mock Tests
13. `vm2/simulation/testing/mock_execution.test.cpp`
14. `vm2/simulation/testing/mock_execution_components.test.cpp`
15. `vm2/simulation/testing/mock_execution_id_manager.test.cpp`
16. `vm2/simulation/testing/mock_memory.test.cpp`
17. `vm2/simulation/testing/mock_context.test.cpp`
18. `vm2/simulation/testing/mock_context_provider.test.cpp`
