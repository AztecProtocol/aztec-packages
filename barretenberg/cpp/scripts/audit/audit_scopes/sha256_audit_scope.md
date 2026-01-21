# External Audit Scope: SHA256

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD

---

## Files to Audit

### Native Implementation
1. `crypto/sha256/sha256.hpp`
2. `crypto/sha256/sha256.cpp`

### Stdlib Circuit Implementation
3. `stdlib/hash/sha256/sha256.hpp`
4. `stdlib/hash/sha256/sha256.cpp`

### Lookup Tables
5. `stdlib_circuit_builders/plookup_tables/sha256.hpp`
6. `stdlib_circuit_builders/plookup_tables/sparse.hpp`
7. `numeric/bitop/sparse_form.hpp`

### DSL/ACIR Format
8. `dsl/acir_format/sha256_constraint.hpp`
9. `dsl/acir_format/sha256_constraint.cpp`

---

## Brief Summary of Module

SHA256 implementation for use in Aztec circuits.

**Specification:** NIST FIPS 180-4 - Secure Hash Standard
https://csrc.nist.gov/publications/detail/fips/180/4/final

**Architecture:**
- Native C++ implementation of SHA-256 (64 rounds, 512-bit blocks)
- Circuit implementation using base-16 sparse representation
- 17 plookup table types for efficient constraint generation
- ACIR opcode integration for Noir `sha256` builtin

**Circuit Technique:**
- 32-bit words decomposed into 4 × 16-bit sparse limbs
- Choose (Ch) and Majority (Maj) functions via lookup tables
- Rotations precomputed in table outputs

---

## Test Files

1. `crypto/sha256/sha256.test.cpp`
   - 5 NIST test vectors

2. `stdlib/hash/sha256/sha256.test.cpp`
   - 5 NIST test vectors (circuit)
   - Boundary tests (55 bytes, multi-block)
   - Various input length tests

3. `dsl/acir_format/sha256_constraint.test.cpp`
   - ACIR integration test

---

## Security Mechanisms

1. `stdlib/hash/sha256/sha256.fuzzer.cpp`
   - Differential fuzzer: circuit vs native

2. `boomerang_value_detection/graph_description_sha256.test.cpp`
   - Boomerang value detection: verifies no under-constrained variables
