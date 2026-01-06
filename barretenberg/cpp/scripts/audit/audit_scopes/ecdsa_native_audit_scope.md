# ECDSA Audit Scope

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 4a956ceb179c2fe855e4f1fd78f2594e7fc3f5ea

### Files to audit

#### Native implementation
1. ```barretenberg/cpp/src/barretenberg/crypto/ecdsa/ecdsa.hpp```
2. ```barretenberg/cpp/src/barretenberg/crypto/ecdsa/ecdsa_impl.hpp```
3. ```barretenberg/cpp/src/barretenberg/crypto/hmac/hmac.hpp```

#### Tests
4. ```barretenberg/cpp/src/barretenberg/crypto/ecdsa/ecdsa.test.cpp```
    - Test vectors for ECDSA signature generation and verification
5. ```barretenberg/cpp/src/barretenberg/crypto/hmac/hmac.test.cpp```
    - Test vectors for HMAC implementation



### Summary of the module

#### ECDSA
ECDSA (Elliptic Curve Digital Signature Algorithm) is a digital signature scheme based on elliptic curve cryptography. This implementation supports both secp256k1 and secp256r1 curves.

The implementation provides:
- Key pair generation
- Signature creation (sign operation)
- Signature verification
- Support for multiple hash functions (SHA256, BLAKE2s, BLAKE3)
- Recovery of public key from signature (recover_public_key)

Key components:
- `ecdsa_key_pair`: Contains private key and public key
- `ecdsa_signature`: Contains r, s components and recovery id (v)
- Template-based design supporting different curves (secp256k1, secp256r1)

#### HMAC
HMAC (Hash-based Message Authentication Code) is a cryptographic authentication mechanism. It is used within ECDSA for deterministic nonce generation (RFC 6979) to prevent vulnerabilities from weak random number generators.

Key features:
- Implements HMAC-DRBG for deterministic k-value generation in ECDSA
- Template-based design supporting various hash functions

### Documentation

ECDSA specification: https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm
