# External Audit Scope: fields

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Core Field Implementation
1. `ecc/fields/field.hpp`
2. `ecc/fields/field_declarations.hpp`
3. `ecc/fields/field_impl.hpp`
4. `ecc/fields/field_impl_generic.hpp`
5. `ecc/fields/field_impl_x64.hpp`
6. `ecc/fields/asm_macros.hpp`

### Field Extensions
7. `ecc/fields/field2.hpp`
8. `ecc/fields/field2_declarations.hpp`
9. `ecc/fields/field6.hpp`
10. `ecc/fields/field12.hpp`

### Field Utilities
11. `ecc/fields/field_conversion.hpp`

## Summary of Module

The `fields` module provides the foundational finite field arithmetic implementations for the entire Barretenberg proving system. It implements prime field arithmetic for 254-bit (bn254, grumpkin) and 256-bit (secp256k1, secp256r1) fields using Montgomery reduction for efficient multiplication. The module includes multiple architecture-specific optimizations: x86_64 assembly implementations (with and without Intel ADX instructions), generic 64-bit implementations for portability and compile-time computation, and WASM-targeted implementations using 29-bit limbs. The field implementation uses a relaxed "coarse" representation allowing values in range [0, 2p) for bn254 fields to eliminate unnecessary reductions during multiplication. Field extensions (field2, field6, field12) are built on top of the base field implementation and are used for pairing-based cryptography operations. The field_conversion module provides utilities for converting between different field representations.

## Documentation
1. `ecc/fields/field_docs.md` — Detailed documentation of Montgomery multiplication, architecture details, WASM 29-bit limb implementation, Yuval reduction, and bounds analysis.
2. `ecc/fields/endomorphism_scalars.py` — GLV endomorphism constants and scalar splitting for BN254 Fr, BN254 Fq, and secp256k1 Fr. Derives and verifies all `endo_g1`, `endo_g2`, `endo_minus_b1`, `endo_b2` constants against the `.hpp` parameter files. Includes proofs of the 256-bit-shift approximation error bound, the negative-k2 fix for BN254, and the 129-bit overflow analysis for secp256k1.

## Test Files
1. `ecc/fields/field_conversion.test.cpp`
2. `ecc/fields/prime_field.test.cpp`
3. `ecc/fields/general_field.test.cpp`

## Security Mechanisms
1. Fuzzer: `ecc/fields/field.fuzzer.hpp`
