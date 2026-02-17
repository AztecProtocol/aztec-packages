# External Audit Scope: stdlib_logic

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Primitives
1. `stdlib/primitives/witness/witness.hpp`

### Logic Gadget
2. `stdlib/primitives/logic/logic.hpp`
3. `stdlib/primitives/logic/logic.cpp`

### Lookup Tables
4. `stdlib_circuit_builders/plookup_tables/uint.hpp`

### ACIR Integration
5. `dsl/acir_format/logic_constraint.hpp`
6. `dsl/acir_format/logic_constraint.cpp`

## Summary of Module

The stdlib logic module provides circuit-friendly implementations of bitwise logical operations (XOR and AND) over variable-length unsigned integers. The logic gadget (`logic.hpp/cpp`) decomposes inputs into 32-bit chunks and performs lookups against precomputed uint tables to compute XOR or AND operations, with implicit 32-bit range constraints on each chunk from the lookup operation itself. For non-32-bit-aligned inputs, the final chunk is explicitly range-constrained to ensure correctness. The uint lookup tables (`uint.hpp`) generate multi-tables for 8/16/32/64-bit XOR and AND operations by composing smaller slice-based tables (6-bit, 4-bit, and 2-bit slices with rotation support). These tables are the native computational foundation used by the logic gadget through `plookup_read::read_from_2_to_1_table` with `UINT32_XOR` and `UINT32_AND` table IDs. The module forms a cohesive unit where the lookup tables exist specifically to support efficient circuit implementations of bitwise operations.

## Test Files
1. `stdlib/primitives/logic/logic.test.cpp` (if exists)
2. `stdlib/primitives/plookup/plookup.test.cpp` (tests UINT32_XOR/AND)
3. `ultra_honk/lookup.test.cpp` (tests UINT32_XOR/AND)

## Security Mechanisms
- Range constraints on input chunks to prevent overflow
- Lookup table validation ensures only valid XOR/AND results
- Accumulator reconstruction validates input decomposition
