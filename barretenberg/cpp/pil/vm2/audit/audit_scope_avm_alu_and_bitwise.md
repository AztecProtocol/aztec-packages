# External Audit Scope: ALU and Bitwise

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Core Gadgets" audit scope (`audit_scope_avm_core.md`)
2. The "Execution, Memory, and Calls" audit scope (`audit_scope_avm_execution_and_calls.md`)

## Prerequisite Components

The following PIL files are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

**From "Core Gadgets" audit (`audit_scope_avm_core.md`):**
- `precomputed.pil` -- Shared precomputed columns: lookup tables (bitwise, power-of-2, tag parameters), range selectors, and static AVM parameters.
- `constants_gen.pil` -- Auto-generated protocol constants.
- `range_check.pil` -- Range check gadget. Used by `alu.pil` for limb decompositions in MUL, DIV, SHL, SHR, and TRUNCATE.
- `gt.pil` -- Integer greater-than gadget. Used by `alu.pil` for LT/LTE comparisons.
- `ff_gt.pil` -- Field greater-than gadget. Used by `alu.pil` for field comparisons and canonical decomposition in TRUNCATE.

**From "Execution, Memory, and Calls" audit (`audit_scope_avm_execution_and_calls.md`):**
- `execution.pil` -- Execution trace. Dispatches to `alu.pil` and `bitwise.pil` via selector-gated lookups for arithmetic and bitwise operations respectively.

## Files to Audit

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `alu.pil`
    - Arithmetic and comparison operations over tagged values (field and integers up to u128). Implements ADD, SUB, MUL, DIV, FDIV, EQ, LT, LTE, NOT, SHL, SHR, and TRUNCATE (used by SET/CAST). Includes error handling for tag mismatches, division by zero, and invalid FF operations. Depends on `precomputed.pil`, `constants_gen.pil`, `range_check.pil`, `gt.pil`, and `ff_gt.pil`.
2. `bitwise.pil`
    - Bitwise AND, OR, and XOR operations over tagged integer values (U1 through U128). Decomposes inputs into 8-bit chunks and looks up byte-level results in the precomputed bitwise table, then accumulates the result. Multi-row computation: one row per byte (counter from tag byte length down to 1). Handles two error cases: FF tag and tag mismatch. Provides separate start selectors for execution dispatch (`start`), keccak (`start_keccak`), and sha256 (`start_sha256`). Depends on `precomputed.pil` and `constants_gen.pil`.

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `alu_impl.hpp`
- `bitwise_impl.hpp`

## Summary of Module

This audit covers the **ALU** and **bitwise** subtraces of the AVM circuit. Both are dispatched from the execution trace (audited in the prerequisite "Execution, Memory, and Calls" scope).

The **ALU** is the main arithmetic subtrace. It implements all arithmetic, comparison, bitwise-NOT, shift, and truncation operations over the AVM's tagged value types (U1, U8, U16, U32, U64, U128, FF). It dispatches to GT and FieldGT for comparisons, and to range check for limb decompositions used in MUL, DIV, SHL, SHR, and TRUNCATE. The ALU also handles three error cases: tag mismatches, division by zero, and invalid FF operations (e.g., bitwise NOT on a field element).

The **bitwise** subtrace implements AND, OR, and XOR operations over tagged integer values. It decomposes inputs into 8-bit chunks and looks up byte-level results from the precomputed bitwise table, then accumulates the full result. It is a multi-row computation (one row per byte, governed by a counter matching the tag's byte length). It handles FF tag and tag mismatch errors. Beyond the execution dispatch, the bitwise subtrace also provides dedicated start selectors for the keccak and sha256 hash gadgets, which use bitwise XOR internally.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files (boolean checks, conditional assignment, accumulators, comparisons, etc.), see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/alu.test.cpp`
- `vm2/constraining/relations/bitwise.test.cpp`
- `vm2/tracegen/alu_trace.test.cpp`
- `vm2/tracegen/bitwise_trace.test.cpp`
- `vm2/simulation/gadgets/alu.test.cpp`
- `vm2/simulation/gadgets/bitwise.test.cpp`
- `vm2/simulation/testing/mock_alu.test.cpp`
- `vm2/simulation/testing/mock_bitwise.test.cpp`
- `vm2/integration_tests/alu_integration.test.cpp`
