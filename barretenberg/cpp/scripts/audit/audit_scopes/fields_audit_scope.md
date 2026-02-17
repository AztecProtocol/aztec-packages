# External Audit Scope: fields

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Core Field Implementation
1. `ecc/fields/field.hpp`
2. `ecc/fields/field_declarations.hpp`
3. `ecc/fields/field_impl.hpp`
4. `ecc/fields/field_impl_generic.hpp`
5. `ecc/fields/field_impl_x64.hpp`
6. `ecc/fields/asm_macros.hpp`
7. `ecc/fields/macro_scrapbook.hpp`

### Field Extensions
8. `ecc/fields/field2.hpp`
9. `ecc/fields/field2_declarations.hpp`
10. `ecc/fields/field6.hpp`
11. `ecc/fields/field12.hpp`

### Field Utilities
12. `ecc/fields/field_conversion.hpp`

## Summary of Module

The `fields` module provides the foundational finite field arithmetic implementations for the entire Barretenberg proving system. It implements prime field arithmetic for 254-bit (bn254, grumpkin) and 256-bit (secp256k1, secp256r1) fields using Montgomery reduction for efficient multiplication. The module includes multiple architecture-specific optimizations: x86_64 assembly implementations (with and without Intel ADX instructions), generic 64-bit implementations for portability and compile-time computation, and WASM-targeted implementations using 29-bit limbs. The field implementation uses a relaxed "coarse" representation allowing values in range [0, 2p) for bn254 fields to eliminate unnecessary reductions during multiplication. Field extensions (field2, field6, field12) are built on top of the base field implementation and are used for pairing-based cryptography operations. The field_conversion module provides utilities for converting between different field representations.

## Test Files
1. `ecc/fields/field_conversion.test.cpp`

## Security Mechanisms
None identified.
