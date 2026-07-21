# External Audit Scope: ECC Curves and Groups

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: Most recent commit on branch 'next'

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

### Precomputed Generators
7. `ecc/groups/precomputed_generators.hpp`
8. `ecc/groups/precomputed_generators_bn254_impl.hpp`
9. `ecc/groups/precomputed_generators_grumpkin_impl.hpp`
10. `ecc/groups/precomputed_generators_secp256k1_impl.hpp`
11. `ecc/groups/precomputed_generators_secp256r1_impl.hpp`

### BN254 Curve
12. `ecc/curves/bn254/bn254.hpp`
13. `ecc/curves/bn254/fq.hpp`
14. `ecc/curves/bn254/fq2.hpp`
15. `ecc/curves/bn254/fq6.hpp`
16. `ecc/curves/bn254/fq12.hpp`
17. `ecc/curves/bn254/fr.hpp`
18. `ecc/curves/bn254/g1.hpp`
19. `ecc/curves/bn254/g2.hpp`
20. `ecc/curves/bn254/pairing.hpp`
21. `ecc/curves/bn254/pairing_impl.hpp`

### Grumpkin Curve
22. `ecc/curves/grumpkin/grumpkin.hpp`

### secp256k1 Curve
23. `ecc/curves/secp256k1/secp256k1.hpp`

### secp256r1 Curve
24. `ecc/curves/secp256r1/secp256r1.hpp`

### Common Types
25. `ecc/curves/types.hpp`

### Stdlib Curve Primitives
26. `stdlib/primitives/curves/bn254.hpp`
27. `stdlib/primitives/curves/grumpkin.hpp`
28. `stdlib/primitives/curves/secp256k1.hpp`
29. `stdlib/primitives/curves/secp256r1.hpp`

## Summary of Module

The ECC curves and groups module provides the elliptic curve infrastructure used throughout Barretenberg's cryptographic operations. The groups layer defines generic affine and projective (Jacobian) point representations with efficient formulas for point addition, doubling, and scalar multiplication, including windowed non-adjacent form (wNAF) optimization. The curves layer instantiates these group operations for specific curves: BN254 (the primary curve for proof generation), Grumpkin (used for client-side IVC), secp256k1, and secp256r1 (used for ECDSA signature verification in circuits). The BN254 implementation includes extension field arithmetic (Fq, Fq2, Fq6, Fq12) required for optimal ate pairing computations, which are fundamental to the KZG polynomial commitment scheme. Each curve definition provides group elements (G1, G2 for pairing-friendly curves), scalar field operations, and curve-specific optimizations like endomorphism support for efficient scalar multiplication.

## Test Files
1.  `ecc/groups/affine_element.test.cpp`
2.  `ecc/groups/element.test.cpp`
3.  `ecc/groups/wnaf.test.cpp`
4.  `ecc/curves/bn254/fq.test.cpp`
5.  `ecc/curves/bn254/fq2.test.cpp`
6.  `ecc/curves/bn254/fq6.test.cpp`
7.  `ecc/curves/bn254/fq12.test.cpp`
8.  `ecc/curves/bn254/fr.test.cpp`
9.  `ecc/curves/bn254/g1.test.cpp`
10. `ecc/curves/bn254/g2.test.cpp`
11. `ecc/curves/bn254/pairing.test.cpp`
12. `ecc/curves/bn254/bn254.test.cpp`
13. `ecc/curves/field_params_constants.test.cpp`
14. `ecc/curves/grumpkin/grumpkin.test.cpp`
15. `ecc/curves/secp256k1/secp256k1.test.cpp`
16. `ecc/curves/secp256r1/secp256r1.test.cpp`

## Security Mechanisms

The file `ecc/curves/multi_field.fuzzer.cpp` implements a multi-field fuzzer for testing field arithmetic operations across different elliptic curve fields. See the file for more details.
