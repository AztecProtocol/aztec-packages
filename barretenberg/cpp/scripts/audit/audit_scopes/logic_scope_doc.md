# External Audit Scope: Logic

Repository: https://github.com/AztecProtocol/aztec-packages

Commit hash: TBD

## Files to Audit

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `stdlib/primitives/logic/logic.hpp`
2. `stdlib/primitives/logic/logic.cpp`
3. `stdlib_circuit_builders/plookup_tables/uint.hpp` (lookup tables)

## Summary of Module

The `logic` module provides circuit-friendly implementations of bitwise logical operations (XOR and AND) over variable-length unsigned integers using plookup tables.

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

## Test Files

1. `stdlib/primitives/logic/logic.test.cpp`

## Dependencies

- Plookup read: `stdlib/primitives/plookup/plookup.hpp`
