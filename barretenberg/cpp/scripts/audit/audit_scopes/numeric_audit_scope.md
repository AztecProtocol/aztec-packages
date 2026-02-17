# External Audit Scope: numeric

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Bit Operations
1. `numeric/bitop/count_leading_zeros.hpp`
2. `numeric/bitop/get_msb.hpp`
3. `numeric/bitop/keep_n_lsb.hpp`
4. `numeric/bitop/pow.hpp`
5. `numeric/bitop/rotate.hpp`

### Random Number Generation
6. `numeric/random/engine.cpp`
7. `numeric/random/engine.hpp`

### Unsigned Integer Types
8. `numeric/uint128/uint128.hpp`
9. `numeric/uint128/uint128_impl.hpp`
10. `numeric/uint256/uint256.hpp`
11. `numeric/uint256/uint256_impl.hpp`
12. `numeric/uintx/uintx.cpp`
13. `numeric/uintx/uintx.hpp`
14. `numeric/uintx/uintx_impl.hpp`

### General Utilities
15. `numeric/general/general.hpp`

## Summary of Module

The numeric module provides fundamental numeric types and bit manipulation utilities used throughout Barretenberg. It implements arbitrary-precision unsigned integer types (uint128_t, uint256_t, and templated uintx for 512/1024-bit integers) with constexpr operations for compile-time computation. The bitop utilities provide efficient bit manipulation including MSB extraction using De Bruijn sequences, leading zero counting, bit rotation, and power operations. The random number generation component provides a consistent cross-compiler interface for generating random values of all supported integer types. These components are foundational primitives used by cryptographic operations, field arithmetic, and circuit builders throughout the codebase.

## Test Files
1. `numeric/bitop/count_leading_zeros.test.cpp`
2. `numeric/bitop/get_msb.test.cpp`
3. `numeric/uint128/uint128.test.cpp`
4. `numeric/uint256/uint256.test.cpp`
5. `numeric/uintx/uintx.test.cpp`
6. `numeric/random/engine.test.cpp`
7. `numeric/bitop/bitop.bench.cpp`

## Security Mechanisms
