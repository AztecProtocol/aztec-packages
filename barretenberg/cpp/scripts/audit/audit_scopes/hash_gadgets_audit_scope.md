# External Audit Scope: Hash Gadgets

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: set when the audit starts. File list checked against `a18e6e7` (branch `v6`).

Note: All paths are relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

---

## Shared Infrastructure

### Files to Audit

The following files are shared across multiple hash implementations:

#### Plookup Infrastructure
1. `stdlib/primitives/plookup/plookup.cpp`
   - for `plookup_read<Builder>::get_lookup_accumulators` and the code it calls
2. `stdlib_circuit_builders/plookup_tables/plookup_tables.hpp`
3. `stdlib_circuit_builders/plookup_tables/plookup_tables.cpp`
   - items 2 and 3: for `ReadData<bb::fr> get_lookup_accumulators`

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

- Native C++ implementation of SHA-256 (64 rounds, 512-bit blocks).
- The circuit uses sparse representations: base 16 for the message schedule and Majority, base 28 for Choose.
- `stdlib_circuit_builders/plookup_tables/types.hpp` defines 18 SHA-256 table IDs (12 basic tables, 6 multi-tables).
- Message-schedule words are split into 4 sparse limbs (bits 0-2, 3-9, 10-17, 18-31).
- Choose (Ch) and Majority (Maj) are computed via lookup tables. Rotations come from table outputs and `rotated_limb_corrections`.
- ACIR opcode integration for the Noir `sha256` builtin.

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
   - 5 NIST test vectors
2. `stdlib/hash/sha256/sha256.test.cpp`
   - block-function tests: 2 NIST vectors (`BlockNistVectorOne/Two`), constant and witness mixes of input and initial hash (`BlockAllConstants`, `BlockConstantHinitWitnessInput`, `BlockWitnessHinitConstantInput`, `BlockMixedConstantsAndWitnesses`)
   - message-schedule extension tests (`ExtendWitnessMixedInputs`, `ExtendWitnessTamperingFailure`)
3. `dsl/acir_format/sha256_constraint.test.cpp`
   - ACIR integration test

### Security Mechanisms
1. `stdlib/hash/sha256/sha256.fuzzer.cpp`
   - Differential fuzzer: circuit vs native
2. `boomerang_value_detection/graph_description_sha256.test.cpp`
   - Boomerang value detection: verifies no under-constrained variables

---

## 2. BLAKE2s + BLAKE3

### Summary

#### BLAKE2s
Implements the unkeyed, sequential BLAKE2s and outputs a 32 byte hash. XOR+Rotate operations are implemented via lookups (see the shared plookup files above).

`g` calls `hash_utils::add_normalize_unsafe(..., overflow_bits=3)` (`stdlib/hash/hash_utils.hpp:32`) in its second half (`blake_util.hpp:131,143`; the first half uses `add_two`/`+`) so that addition overflow stays within 3 bits. Regression input: `test_edge_case_addition_overflow` in `stdlib/hash/blake2s/blake2s.test.cpp` and `stdlib/hash/blake3s/blake3s.test.cpp`. Analysis: https://hackmd.io/@aztec-network/SyTHLkAWZx.

#### BLAKE3
A restricted variant of BLAKE3 with inputs limited to ≤1024 bytes that generates a 32 byte hash. This constraint on input size simplifies the code and eliminates recursive merkle-tree operations on chunks (data of 1024 bytes). In Barretenberg, BLAKE3 is only used to hash inputs of at most 32 bytes.

### Documentation

- BLAKE2s: https://www.blake2.net/blake2.pdf
- BLAKE3: https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf
- Lookup tables: [`stdlib_circuit_builders/plookup_tables/README.md`](../../../src/barretenberg/stdlib_circuit_builders/plookup_tables/README.md)

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
    - BLAKE tables such as `BLAKE_XOR`, `BLAKE_XOR_ROTATE_16`, `BLAKE_XOR_ROTATE_8`

#### DSL/ACIR Format
13. `dsl/acir_format/blake2s_constraint.hpp`
14. `dsl/acir_format/blake2s_constraint.cpp`
15. `dsl/acir_format/blake3_constraint.hpp`
16. `dsl/acir_format/blake3_constraint.cpp`

### Test Files
1. `crypto/blake2s/blake2s.test.cpp`
   - test vectors for every message length from 0 to 72 bytes
2. `stdlib/hash/blake2s/blake2s.test.cpp`
   - test vectors for message lengths up to 72 bytes, including power-of-2 boundaries, checked against the native hash
   - single-block and double-block tests
   - all-witness, all-constant and mixed witness/constant inputs
3. `dsl/acir_format/blake2s_constraint.test.cpp`
   - ACIR integration test
4. `crypto/blake3s/blake3s.test.cpp`
   - test vectors for every message length from 0 to 72 bytes
   - a subset of the official BLAKE3 test vectors (unkeyed hash mode, message length ≤ 1024 bytes)
   - checks that inputs longer than 1024 bytes trigger the intended assertion
5. `stdlib/hash/blake3s/blake3s.test.cpp`
   - test vectors for message lengths up to 72 bytes, including power-of-2 boundaries
   - single-block and double-block tests
   - all-witness, all-constant and mixed witness/constant inputs
6. `dsl/acir_format/blake3_constraint.test.cpp`
   - ACIR integration test

### Security Mechanisms
1. `stdlib/hash/blake2s/blake2s.fuzzer.cpp`
2. `stdlib/hash/blake3s/blake3s.fuzzer.cpp`
3. `boomerang_value_detection/graph_description_blake2s.test.cpp`
4. `boomerang_value_detection/graph_description_blake3s.test.cpp`

---

## 3. AES128

### Summary

The `aes128` module provides both native and circuit-friendly implementations of the AES-128 block cipher with CBC (Cipher Block Chaining) mode.

- Native (`crypto/aes128`): AES-128-CBC encryption and decryption.
- In-circuit (`stdlib/encryption/aes128`): AES-128-CBC encryption. The circuit uses plookup tables for the S-box.
- `aes128_constraint` exposes the in-circuit encryption to ACIR.

### Documentation
- NIST FIPS 197, Advanced Encryption Scheme: https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.197-upd1.pdf

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
3. `dsl/acir_format/aes128_constraint.test.cpp`

### Security Mechanisms
1. `boomerang_value_detection/graph_description_aes128.test.cpp`
2. `stdlib/encryption/aes128/aes128.fuzzer.cpp`

---

## 4. Keccak

### Summary

The Keccak module implements the Keccak-f[1600] permutation inside the circuit, using a base-11 sparse representation of 64-bit lanes plus plookup tables for the theta, rho, pi, chi and iota steps. It provides a `permutation_opcode` method that takes a 25-lane state, applies the full Keccak-f[1600] permutation, and returns an output state consistent with the native `ethash_keccakf1600` implementation.

### Documentation

NIST FIPS 202 defines Keccak-f[1600] (as KECCAK-p[1600,24]) and the sponge construction: https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.202.pdf

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
   - 3 test vectors for the Keccak-f[1600] permutation, generated with the XKCP reference implementation (https://github.com/XKCP/XKCP)
2. `stdlib/hash/keccak/keccak.test.cpp`
   - checks that the in-circuit and native permutations match on a full 25-lane state
   - checks that the `KECCAK_FORMAT_INPUT` lookup maps a 64-bit binary input to sparse base-11 form and extracts the MSB
   - checks that the `KECCAK_FORMAT_OUTPUT` lookup converts sparse base-11 input back to 64-bit binary integers
   - checks that the `KECCAK_THETA_OUTPUT` lookup normalizes outputs within `theta`
   - checks that `normalize_and_rotate` normalizes base-11 inputs, applies the lane-specific bit rotation, and returns the expected output
   - checks that the `KECCAK_CHI_OUTPUT` lookup normalizes outputs within `chi`
3. `dsl/acir_format/keccak_constraint.test.cpp`
   - ACIR integration test

### Security Mechanisms
1. `stdlib/hash/keccak/keccak.fuzzer.cpp`
   - Differential fuzzer: circuit vs native
2. `boomerang_value_detection/graph_description_keccak.test.cpp`

---

## 5. Pedersen Hash (Native Only)

### Summary

Pedersen hash and commitment over Grumpkin (the cycle companion of BN254).

The hash function computes:
```
Hash(v) = n * [h] + Commit(v, g)
```

Where:
- `v` is a list of field elements to hash
- `n` is the length of the input
- `h` is a unique generator point (domain separated by "pedersen_hash_length")
- `g` is a list of linearly independent generator points
- The output is the x-coordinate of the resulting point

The `n * [h]` term prevents length-extension attacks and ensures the output is never the point at infinity (`crypto/pedersen_hash/pedersen.hpp:23-24`). The generators are linearly independent, so finding a collision is as hard as the discrete logarithm problem.

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
2. `crypto/pedersen_commitment/pedersen.test.cpp`
3. `crypto/generators/generator_data.test.cpp`
