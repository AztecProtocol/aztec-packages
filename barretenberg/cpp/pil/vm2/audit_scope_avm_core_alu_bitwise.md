# External Audit Scope: Core Components, ALU, and Bitwise

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `ab47a6e7754a0cc86278fe9d47c9c8884ca6d363` ([link](https://github.com/AztecProtocol/aztec-packages/tree/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363))

## Files to Audit

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### PIL Constraints (source of truth)

Note: Paths relative to `aztec-packages/barretenberg/cpp/pil/vm2`

1. `precomputed.pil`
    - Shared precomputed columns: lookup tables (bitwise, power-of-2, tag parameters), range selectors (`sel_range_8`, `sel_range_16`), and static AVM parameters (gas costs, instruction specs). These columns are known at compile time and their commitments are baked into the verification key.
2. `constants_gen.pil`
    - Auto-generated protocol constants (tree heights, max counts, memory tags, opcode gas costs, etc.). Consumed by nearly every other PIL file.
3. `range_check.pil`
    - Proves a value fits within a specified bit width (`value < 2^rng_chk_bits`). Decomposes into up to eight 16-bit limbs with a dynamic range check on the most significant limb. Used pervasively by ALU, GT, FieldGT, and many other subtraces.
4. `gt.pil`
    - Integer greater-than gadget for values up to 128 bits. Computes `input_a > input_b` via range-checked subtraction. Depends on `range_check.pil`.
5. `ff_gt.pil`
    - Field greater-than gadget and canonical decomposition of a field element into two 128-bit limbs. Handles `a > b` for arbitrary field elements. Also provides `sel_dec` for canonical decomposition (used by ALU truncation). Depends on `range_check.pil`.
6. `alu.pil`
    - Arithmetic and comparison operations over tagged values (field and integers up to u128). Implements ADD, SUB, MUL, DIV, FDIV, EQ, LT, LTE, NOT, SHL, SHR, and TRUNCATE (used by SET/CAST). Includes error handling for tag mismatches, division by zero, and invalid FF operations. Depends on `precomputed.pil`, `constants_gen.pil`, `range_check.pil`, `gt.pil`, and `ff_gt.pil`.
7. `bitwise.pil`
    - Bitwise AND, OR, and XOR operations over tagged integer values (U1 through U128). Decomposes inputs into 8-bit chunks and looks up byte-level results in the precomputed bitwise table, then accumulates the result. Multi-row computation: one row per byte (counter from tag byte length down to 1). Handles two error cases: FF tag and tag mismatch. Provides separate start selectors for execution dispatch (`start`), keccak (`start_keccak`), and sha256 (`start_sha256`). Depends on `precomputed.pil` and `constants_gen.pil`.

### Simulation (gadgets and events)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2`

8. `simulation/gadgets/range_check.hpp`
9. `simulation/gadgets/range_check.cpp`
    - Range check simulation: decomposes values into limbs and emits range check events.
10. `simulation/events/range_check_event.hpp`
    - Event structure for range check trace rows.
11. `simulation/gadgets/gt.hpp`
12. `simulation/gadgets/gt.cpp`
    - Integer GT simulation gadget.
13. `simulation/events/gt_event.hpp`
    - Event structure for GT trace rows.
14. `simulation/gadgets/field_gt.hpp`
15. `simulation/gadgets/field_gt.cpp`
    - Field GT simulation gadget and canonical decomposition.
16. `simulation/events/field_gt_event.hpp`
    - Event structure for FieldGT trace rows.
17. `simulation/gadgets/alu.hpp`
18. `simulation/gadgets/alu.cpp`
    - ALU simulation gadget: computes operation results, errors, and emits ALU + sub-gadget events.
19. `simulation/events/alu_event.hpp`
    - Event structure for ALU trace rows.
20. `simulation/gadgets/bitwise.hpp`
21. `simulation/gadgets/bitwise.cpp`
    - Bitwise simulation gadget: decomposes inputs into bytes, performs AND/OR/XOR, and emits bitwise events.
22. `simulation/events/bitwise_event.hpp`
    - Event structure for bitwise trace rows.
23. `simulation/standalone/pure_alu.hpp`
24. `simulation/standalone/pure_alu.cpp`
    - Standalone ALU used in fast simulation (no event emission).
25. `simulation/standalone/pure_gt.hpp`
    - Standalone GT used by pure ALU.
26. `simulation/standalone/pure_bitwise.hpp`
27. `simulation/standalone/pure_bitwise.cpp`
    - Standalone bitwise used in fast simulation (no event emission).
28. `common/tagged_value.hpp`
29. `common/tagged_value.cpp`
    - Tagged value type used throughout the AVM: wraps a field element with a memory tag (U1, U8, U16, U32, U64, U128, FF).

### Trace Generation

30. `tracegen/precomputed_trace.hpp`
31. `tracegen/precomputed_trace.cpp`
    - Fills the precomputed columns in the trace.
32. `tracegen/range_check_trace.hpp`
33. `tracegen/range_check_trace.cpp`
    - Processes range check events and populates range check columns.
34. `tracegen/gt_trace.hpp`
35. `tracegen/gt_trace.cpp`
    - Processes GT events and populates GT columns.
36. `tracegen/field_gt_trace.hpp`
37. `tracegen/field_gt_trace.cpp`
    - Processes FieldGT events and populates FieldGT columns.
38. `tracegen/alu_trace.hpp`
39. `tracegen/alu_trace.cpp`
    - Processes ALU events and populates ALU columns.
40. `tracegen/bitwise_trace.hpp`
41. `tracegen/bitwise_trace.cpp`
    - Processes bitwise events and populates bitwise columns.

### Interfaces and Mocks

42. `simulation/interfaces/range_check.hpp`
43. `simulation/interfaces/gt.hpp`
44. `simulation/interfaces/field_gt.hpp`
45. `simulation/interfaces/alu.hpp`
46. `simulation/interfaces/bitwise.hpp`
    - Abstract interfaces for the gadgets (used for dependency injection and testing).
47. `simulation/testing/mock_range_check.hpp`
48. `simulation/testing/mock_gt.hpp`
49. `simulation/testing/mock_field_gt.hpp`
50. `simulation/testing/mock_alu.hpp`
51. `simulation/testing/mock_bitwise.hpp`
    - Mock implementations used in unit tests.

## Summary of Module

This audit covers the **core gadget layer** of the AVM circuit, the **ALU**, and the **bitwise** subtrace.

The **precomputed** subtrace provides shared lookup tables (bitwise operations, powers of two, tag parameters, instruction specs) and range selectors that are used by virtually every other subtrace. The **constants** file defines protocol-wide numeric constants.

The **range check** gadget is the foundational building block: it proves that a value fits within a given number of bits by decomposing it into 16-bit limbs. It is used pervasively across the AVM.

The **GT** (integer greater-than) and **FieldGT** (field greater-than / canonical decomposition) gadgets build on range checks to prove comparison results. GT handles integers up to 128 bits; FieldGT handles arbitrary BN254 field elements by decomposing them into 128-bit limbs and comparing against the field modulus.

The **ALU** is the main arithmetic subtrace. It implements all arithmetic, comparison, bitwise-NOT, shift, and truncation operations over the AVM's tagged value types (U1, U8, U16, U32, U64, U128, FF). It dispatches to GT and FieldGT for comparisons, and to range check for limb decompositions used in MUL, DIV, SHL, SHR, and TRUNCATE. The ALU also handles three error cases: tag mismatches, division by zero, and invalid FF operations (e.g., bitwise NOT on a field element).

The **bitwise** subtrace implements AND, OR, and XOR operations over tagged integer values. It decomposes inputs into 8-bit chunks and looks up byte-level results from the precomputed bitwise table, then accumulates the full result. It is a multi-row computation (one row per byte, governed by a counter matching the tag's byte length). It handles FF tag and tag mismatch errors. Beyond the execution dispatch, the bitwise subtrace also provides dedicated start selectors for the keccak and sha256 hash gadgets, which use bitwise XOR internally.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files (boolean checks, conditional assignment, accumulators, comparisons, etc.), see [VM Circuit Recipes](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/recipes.md).

## Test Files

### Constraint Tests (relation-level)
1. `vm2/constraining/relations/alu.test.cpp`
2. `vm2/constraining/relations/range_check.test.cpp`
3. `vm2/constraining/relations/gt.test.cpp`
4. `vm2/constraining/relations/field_gt.test.cpp`
5. `vm2/constraining/relations/bitwise.test.cpp`

### Tracegen Tests
6. `vm2/tracegen/alu_trace.test.cpp`
7. `vm2/tracegen/range_check_trace.test.cpp`
8. `vm2/tracegen/gt_trace.test.cpp`
9. `vm2/tracegen/precomputed_trace.test.cpp`
10. `vm2/tracegen/bitwise_trace.test.cpp`

### Simulation/Gadget Tests
11. `vm2/simulation/gadgets/alu.test.cpp`
12. `vm2/simulation/gadgets/range_check.test.cpp`
13. `vm2/simulation/gadgets/gt.test.cpp`
14. `vm2/simulation/gadgets/field_gt.test.cpp`
15. `vm2/simulation/gadgets/bitwise.test.cpp`

### Mock Tests
16. `vm2/simulation/testing/mock_alu.test.cpp`
17. `vm2/simulation/testing/mock_range_check.test.cpp`
18. `vm2/simulation/testing/mock_gt.test.cpp`
19. `vm2/simulation/testing/mock_field_gt.test.cpp`
20. `vm2/simulation/testing/mock_bitwise.test.cpp`

### Integration Tests
21. `vm2/integration_tests/alu_integration.test.cpp`

### Other
22. `vm2/common/tagged_value.test.cpp`
