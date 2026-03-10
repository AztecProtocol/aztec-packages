# External Audit Scope: ECC Curves

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `158dd845c99f8f702979c20f1625730d126c4b20`

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### BN254 Curve
1. `ecc/curves/bn254/bn254.hpp`
2. `ecc/curves/bn254/fq.hpp`
3. `ecc/curves/bn254/fq2.hpp`
4. `ecc/curves/bn254/fq6.hpp`
5. `ecc/curves/bn254/fq12.hpp`
6. `ecc/curves/bn254/fr.hpp`
7. `ecc/curves/bn254/g1.hpp`
8. `ecc/curves/bn254/g2.hpp`
9. `ecc/curves/bn254/pairing.hpp`
10. `ecc/curves/bn254/pairing_impl.hpp`

### Grumpkin Curve
11. `ecc/curves/grumpkin/grumpkin.hpp`

### secp256k1 Curve
12. `ecc/curves/secp256k1/secp256k1.hpp`

### secp256r1 Curve
13. `ecc/curves/secp256r1/secp256r1.hpp`

### Common Types
14. `ecc/curves/types.hpp`

### Stdlib Curve Primitives
15. `stdlib/primitives/curves/bn254.hpp`
16. `stdlib/primitives/curves/grumpkin.hpp`
17. `stdlib/primitives/curves/secp256k1.hpp`
18. `stdlib/primitives/curves/secp256r1.hpp`

## Summary of Module

The ECC curves module defines the elliptic curves used throughout Barretenberg's cryptographic operations. It implements field arithmetic and curve point operations for multiple curves including BN254 (the primary curve for proof generation), Grumpkin (used for client-side IVC), secp256k1, and secp256r1 (used for ECDSA signature verification in circuits). The BN254 implementation includes extension field arithmetic (Fq, Fq2, Fq6, Fq12) required for optimal ate pairing computations, which are fundamental to the KZG polynomial commitment scheme. Each curve definition provides group elements (G1, G2 for pairing-friendly curves), scalar field operations, and curve-specific optimizations like endomorphism support for efficient scalar multiplication.

## Test Files
1.  `ecc/curves/bn254/fq.test.cpp`
2.  `ecc/curves/bn254/fq2.test.cpp`
3.  `ecc/curves/bn254/fq6.test.cpp`
4.  `ecc/curves/bn254/fq12.test.cpp`
5.  `ecc/curves/bn254/fr.test.cpp`
6.  `ecc/curves/bn254/g1.test.cpp`
7.  `ecc/curves/bn254/g2.test.cpp`
8.  `ecc/curves/bn254/pairing.test.cpp`
10. `ecc/curves/bn254/bn254.test.cpp`
10. `ecc/curves/field_params_constants.test.cpp`
11. `ecc/curves/grumpkin/grumpkin.test.cpp`
12. `ecc/curves/secp256k1/secp256k1.test.cpp`
13. `ecc/curves/secp256r1/secp256r1.test.cpp`

## Security Mechanisms

The file `ecc/curves/multi_field.fuzzer.cpp` implements a multi-field fuzzer for testing field arithmetic operations across different elliptic curve fields. See the file for more details.
