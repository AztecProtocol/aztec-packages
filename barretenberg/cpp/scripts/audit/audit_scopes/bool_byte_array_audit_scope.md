# External Audit Scope: bool and byte_array

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `b463d7c1c52fec2f4e39acfd21219464b00a39d8` ([link](https://github.com/AztecProtocol/aztec-packages/tree/b463d7c1c52fec2f4e39acfd21219464b00a39d8))

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `stdlib/primitives/bool/bool.hpp`
2. `stdlib/primitives/bool/bool.cpp`
3. `stdlib/primitives/byte_array/byte_array.hpp`
4. `stdlib/primitives/byte_array/byte_array.cpp`

## Summary of Module

### bool_t

The `bool_t` class implements boolean logic in-circuit. To avoid constraining negation operations, it represents an in-circuit boolean using a witness value and a `witness_inverted` flag. The actual boolean value is computed as `w XOR i = w + i - 2*i*w`.

Key operations:
- Negation: Simply flips the `witness_inverted` flag (no gate cost)
- AND, OR, XOR: Implemented via algebraic representations with appropriate constraints
- Comparison with `field_t` values

### byte_array

The `byte_array` class represents a dynamic array of bytes in-circuit, built on top of `field_t` elements. Each byte is range-constrained to 8 bits.

Key features:
- Stores bytes as `field_t` elements with range constraints
- Supports operations like `slice()`, `reverse()`, concatenation
- Provides conversions to/from `field_t` via `get_bit()` and related methods
- Mostly used for handling data in hash functions

## Test Files
1. `stdlib/primitives/bool/bool.test.cpp`
2. `stdlib/primitives/byte_array/byte_array.test.cpp`

## Security Mechanisms
1. Fuzzer: `stdlib/primitives/bool/bool.fuzzer.hpp`
2. Fuzzer: `stdlib/primitives/bool/bool_ultra.fuzzer.cpp`
3. Fuzzer: `stdlib/primitives/byte_array/byte_array.fuzzer.hpp`
4. Fuzzer: `stdlib/primitives/byte_array/byte_array_ultra.fuzzer.cpp`
