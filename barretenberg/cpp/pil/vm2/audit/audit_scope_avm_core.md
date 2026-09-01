# External Audit Scope: Core Gadgets

Commit hash: _TBD_

## Files to Audit

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

### Generated C++ (confirm faithfulness to PIL)

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg/vm2/generated/relations`

The following files are auto-generated from the PIL files above by `bb-pilcom`. The audit should confirm that the generated C++ directly reflects the PIL source of truth.

- `range_check_impl.hpp`
- `gt_impl.hpp`
- `ff_gt_impl.hpp`

Note: `precomputed.pil` and `constants_gen.pil` define precomputed columns and constants, not relation constraints, and do not have generated relation files.

## Summary of Module

This audit covers the **core gadget layer** of the AVM circuit.

The **precomputed** subtrace provides shared lookup tables (bitwise operations, powers of two, tag parameters, instruction specs) and range selectors that are used by virtually every other subtrace. The **constants** file defines protocol-wide numeric constants.

The **range check** gadget is the foundational building block: it proves that a value fits within a given number of bits by decomposing it into 16-bit limbs. It is used pervasively across the AVM.

The **GT** (integer greater-than) and **FieldGT** (field greater-than / canonical decomposition) gadgets build on range checks to prove comparison results. GT handles integers up to 128 bits; FieldGT handles arbitrary BN254 field elements by decomposing them into 128-bit limbs and comparing against the field modulus.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files (boolean checks, conditional assignment, accumulators, comparisons, etc.), see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

- `vm2/constraining/relations/range_check.test.cpp`
- `vm2/constraining/relations/gt.test.cpp`
- `vm2/constraining/relations/field_gt.test.cpp`
- `vm2/tracegen/range_check_trace.test.cpp`
- `vm2/tracegen/gt_trace.test.cpp`
- `vm2/tracegen/precomputed_trace.test.cpp`
- `vm2/simulation/gadgets/range_check.test.cpp`
- `vm2/simulation/gadgets/gt.test.cpp`
- `vm2/simulation/gadgets/field_gt.test.cpp`
- `vm2/simulation/testing/mock_range_check.test.cpp`
- `vm2/simulation/testing/mock_gt.test.cpp`
- `vm2/simulation/testing/mock_field_gt.test.cpp`
- `vm2/common/tagged_value.test.cpp`
