# External Audit Scope: ECC Groups

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Group Element Implementations
1. `ecc/groups/affine_element.hpp`
2. `ecc/groups/affine_element_impl.hpp`
3. `ecc/groups/element.hpp`
4. `ecc/groups/element_impl.hpp`
5. `ecc/groups/group.hpp`

### Scalar Multiplication Optimizations
6. `ecc/groups/wnaf.hpp`

## Summary of Module

The ECC groups module provides generic implementations of elliptic curve group operations that work across all supported curves (BN254, Grumpkin, secp256k1, secp256r1). It defines affine and projective point representations with efficient formulas for point addition, doubling, and scalar multiplication. The affine element implementation handles point serialization and batch normalization operations. The projective element implementation uses Jacobian coordinates for efficient chain of operations without expensive field inversions. The windowed non-adjacent form (wNAF) implementation optimizes scalar multiplication by reducing the number of point additions through precomputation and signed digit representation. These generic group operations are instantiated for specific curves defined in the ecc/curves module.

## Test Files
1. `ecc/groups/affine_element.test.cpp`
2. `ecc/groups/wnaf.test.cpp`

## Security Mechanisms
