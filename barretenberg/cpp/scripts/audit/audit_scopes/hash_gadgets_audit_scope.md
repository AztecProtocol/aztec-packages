# External Audit Scope: Hash Gadgets

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 21476601b111f046f023474465598843e4cfd8ac

Note: All paths are relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

---

## Shared Infrastructure

### Files to Audit

The following files are shared across multiple hash implementations:

#### Plookup Infrastructure
1. `stdlib/primitives/plookup/plookup.cpp`
2. `stdlib_circuit_builders/plookup_tables/plookup_tables.hpp`
3. `stdlib_circuit_builders/plookup_tables/plookup_tables.cpp`

#### Sparse Representation
4. `stdlib_circuit_builders/plookup_tables/sparse.hpp`
5. `numeric/bitop/sparse_form.hpp`

#### Circuit Utilities
6. `stdlib/hash/hash_utils.hpp`

#### BB API
7. `bbapi/bbapi_crypto.hpp`
8. `bbapi/bbapi_crypto.cpp`

---

## 1. SHA256

### Summary

SHA256 implementation (both native and in-circuit).

### Documentation

NIST FIPS 180-4 - Secure Hash Standard: https://csrc.nist.gov/publications/detail/fips/180/4/final

### Files to Audit

#### Native Implementation
1. `crypto/sha256/sha256.hpp`
2. `crypto/sha256/sha256.cpp`

#### Stdlib Circuit Implementation
3. `stdlib/hash/sha256/sha256.hpp`
4. `stdlib/hash/sha256/sha256.cpp`

#### Lookup Tables
5. `stdlib_circuit_builders/plookup_tables/sha256.hpp`

#### DSL/ACIR Format
6. `dsl/acir_format/sha256_constraint.hpp`
7. `dsl/acir_format/sha256_constraint.cpp`

### Test Files
1. `crypto/sha256/sha256.test.cpp`
2. `stdlib/hash/sha256/sha256.test.cpp`
3. `dsl/acir_format/sha256_constraint.test.cpp`

### Security Mechanisms
1. `stdlib/hash/sha256/sha256.fuzzer.cpp`
2. `boomerang_value_detection/graph_description_sha256.test.cpp`

---

## 2. BLAKE2s + BLAKE3

### Summary

#### BLAKE2s
Implements the unkeyed, sequential BLAKE2s and outputs a 32 byte hash. XOR+Rotate operations are implemented via lookups.

#### BLAKE3
A restricted variant of BLAKE3 with inputs limited to ≤1024 bytes that generates a 32 byte hash. This constraint on input size simplifies the code and eliminates recursive merkle-tree operations on chunks. In Barretenberg, BLAKE3 is only used to hash inputs of size 32 bytes or less.

### Documentation

- BLAKE2s: https://www.blake2.net/blake2.pdf
- BLAKE3: https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf
- Lookup tables: https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/README.md

### Files to Audit

#### Native Implementation
1. `crypto/blake2s/blake2s.hpp`
2. `crypto/blake2s/blake2s.cpp`
3. `crypto/blake2s/blake2-impl.hpp`
4. `crypto/blake3s/blake3s.hpp`
5. `crypto/blake3s/blake3s.tcc`
6. `crypto/blake3s/blake3-impl.hpp`

#### Stdlib Circuit Implementation
7. `stdlib/hash/blake2s/blake2s.hpp`
8. `stdlib/hash/blake2s/blake2s.cpp`
9. `stdlib/hash/blake3s/blake3s.hpp`
10. `stdlib/hash/blake3s/blake3s.cpp`
11. `stdlib/hash/blake2s/blake_util.hpp`

#### Lookup Tables
12. `stdlib_circuit_builders/plookup_tables/blake2s.hpp`

#### DSL/ACIR Format
13. `dsl/acir_format/blake2s_constraint.hpp`
14. `dsl/acir_format/blake2s_constraint.cpp`
15. `dsl/acir_format/blake3_constraint.hpp`
16. `dsl/acir_format/blake3_constraint.cpp`

### Test Files
1. `crypto/blake2s/blake2s.test.cpp`
2. `stdlib/hash/blake2s/blake2s.test.cpp`
3. `dsl/acir_format/blake2s_constraint.test.cpp`
4. `crypto/blake3s/blake3s.test.cpp`
5. `stdlib/hash/blake3s/blake3s.test.cpp`
6. `dsl/acir_format/blake3_constraint.test.cpp`

### Security Mechanisms
1. `boomerang_value_detection/graph_description_blake2s.test.cpp`
2. `boomerang_value_detection/graph_description_blake3s.test.cpp`

---

## 3. AES128

### Summary

The `aes128` module provides both native and circuit-friendly implementations of the AES-128 block cipher with CBC (Cipher Block Chaining) mode.

### Files to Audit

#### Native Implementation
1. `crypto/aes128/aes128.cpp`
2. `crypto/aes128/aes128.hpp`

#### Stdlib Circuit Implementation
3. `stdlib/encryption/aes128/aes128.cpp`
4. `stdlib/encryption/aes128/aes128.hpp`

#### Lookup Tables
5. `stdlib_circuit_builders/plookup_tables/aes128.hpp`

#### DSL/ACIR Format
6. `dsl/acir_format/aes128_constraint.cpp`
7. `dsl/acir_format/aes128_constraint.hpp`

### Test Files
1. `crypto/aes128/aes128.test.cpp`
2. `stdlib/encryption/aes128/aes128.test.cpp`

### Security Mechanisms
1. `boomerang_value_detection/graph_description_aes128.test.cpp`

---

## 4. Keccak

### Summary

The Keccak module implements the Keccak-f[1600] permutation inside the circuit, using a base-11 sparse representation of 64-bit lanes plus plookup tables for the theta, rho, pi, chi and iota steps.

### Documentation

NIST FIPS 202: https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.202.pdf

### Files to Audit

#### Native Implementation
1. `crypto/keccak/keccak.hpp`
2. `crypto/keccak/keccak.cpp`
3. `crypto/keccak/keccakf1600.cpp`
4. `crypto/keccak/hash_types.hpp`

#### Stdlib Circuit Implementation
5. `stdlib/hash/keccak/keccak.hpp`
6. `stdlib/hash/keccak/keccak.cpp`

#### Lookup Tables
7. `stdlib_circuit_builders/plookup_tables/keccak/keccak_input.hpp`
8. `stdlib_circuit_builders/plookup_tables/keccak/keccak_output.hpp`
9. `stdlib_circuit_builders/plookup_tables/keccak/keccak_theta.hpp`
10. `stdlib_circuit_builders/plookup_tables/keccak/keccak_rho.hpp`
11. `stdlib_circuit_builders/plookup_tables/keccak/keccak_chi.hpp`

#### DSL/ACIR Format
12. `dsl/acir_format/keccak_constraint.hpp`
13. `dsl/acir_format/keccak_constraint.cpp`

### Test Files
1. `crypto/keccak/keccak.test.cpp`
2. `stdlib/hash/keccak/keccak.test.cpp`
3. `dsl/acir_format/keccak_constraint.test.cpp`

### Security Mechanisms
1. `stdlib/hash/keccak/keccak.fuzzer.cpp`
2. `boomerang_value_detection/graph_description_keccak.test.cpp`

---

## 5. Pedersen Hash (Native Only)

### Summary

Pedersen hash is a cryptographic commitment scheme based on elliptic curve cryptography. The implementation uses the Grumpkin curve for efficient operations.

### Documentation

Pedersen commitments: https://en.wikipedia.org/wiki/Commitment_scheme#Pedersen_commitment

### Files to Audit

#### Native Implementation
1. `crypto/pedersen_hash/pedersen.hpp`
2. `crypto/pedersen_hash/pedersen.cpp`
3. `crypto/pedersen_commitment/pedersen.hpp`
4. `crypto/pedersen_commitment/pedersen.cpp`
5. `crypto/generators/generator_data.hpp`

### Test Files
1. `crypto/pedersen_hash/pedersen.test.cpp`
2. `crypto/generators/generator_data.test.cpp`
