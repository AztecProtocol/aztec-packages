# External Audit Scope: pippenger

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `ecc/scalar_multiplication/bitvector.hpp`
2. `ecc/scalar_multiplication/process_buckets.cpp`
3. `ecc/scalar_multiplication/process_buckets.hpp`
4. `ecc/scalar_multiplication/scalar_multiplication.cpp`
5. `ecc/scalar_multiplication/scalar_multiplication.hpp`
6. `commitment_schemes/commitment_key.hpp`
7. `commitment_schemes/utils/batch_mul_native.hpp`

## Summary of Module

The `pippenger` module implements the Pippenger multi-scalar multiplication (MSM) algorithm, which efficiently computes linear combinations of elliptic curve points. This is a critical performance component used throughout the proving system for commitment schemes and proof generation. The implementation includes optimizations such as the "affine trick" for batch inversions, bucket-based point accumulation, and multi-threaded execution for large MSMs. The algorithm splits scalars into fixed-bit windows, accumulates points into buckets based on scalar slices, and efficiently processes buckets to produce the final result. The bitvector data structure is used to track bucket occupancy, avoiding the need to clear all buckets between rounds.

## Test Files
1. `ecc/scalar_multiplication/scalar_multiplication.test.cpp`

## Security Mechanisms
None identified.
