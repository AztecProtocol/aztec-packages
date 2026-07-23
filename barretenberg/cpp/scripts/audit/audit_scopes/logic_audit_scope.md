# External Audit Scope: Logic

Repository: https://github.com/AztecProtocol/aztec-packages-private

Commit hash: Most recent commit on branch 'next'

## Files to Audit

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### stdlib (core logic implementation)

1. `stdlib/primitives/logic/logic.hpp`
2. `stdlib/primitives/logic/logic.cpp`
3. `stdlib_circuit_builders/plookup_tables/uint.hpp` (lookup tables)

### dsl (ACIR interface)

4. `dsl/acir_format/logic_constraint.hpp` — ACIR struct and gate function declarations
5. `dsl/acir_format/logic_constraint.cpp` — Converts ACIR logic constraints into stdlib circuit gates

## Summary of Module

The `logic` module provides circuit-friendly implementations of bitwise logical operations (XOR and AND) over variable-length unsigned integers using plookup tables.

### stdlib layer

Main function: `create_logic_constraint(a, b, num_bits, is_xor_gate)`

- Computes `a XOR b` or `a AND b` for inputs up to `num_bits` in length
- Supports inputs up to 252 bits (grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH)

The implementation:

- Decomposes inputs into 32-bit chunks
- Performs lookups against `UINT32_XOR` or `UINT32_AND` multi-tables for each chunk
- The lookup operation implicitly enforces 32-bit range constraints on each chunk
- For non-32-bit-aligned inputs, the final chunk is explicitly range-constrained to the remaining bits
- Input values are reconstructed from chunks and verified via `assert_equal`
- If both inputs are constants, the operation is computed natively without circuit constraints
- If one input is constant, it is converted to a witness before processing

### dsl layer

The DSL layer bridges ACIR opcodes (`BlackBoxFuncCall::AND`, `BlackBoxFuncCall::XOR`) to the stdlib logic implementation:

- `acir_to_constraint_buf.cpp` deserializes ACIR AND/XOR black box calls into `LogicConstraint` structs (deserialization file itself is out of scope)
- `create_logic_gate` converts `WitnessOrConstant` inputs to `field_ct` via `to_field_ct`, calls `stdlib::logic::create_logic_constraint`, and asserts the computed result equals the ACIR-provided result witness

## Test Files

1. `stdlib/primitives/logic/logic.test.cpp`
2. `dsl/acir_format/logic_constraint.test.cpp`

## Dependencies

- Plookup read: `stdlib/primitives/plookup/plookup.hpp`
- ACIR format core: `dsl/acir_format/acir_format.hpp` (constraint application loop)
