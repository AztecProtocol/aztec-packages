# External Audit Scope: aes128

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 21476601b111f046f023474465598843e4cfd8ac

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Native AES-128 Implementation
1. `crypto/aes128/aes128.cpp`
2. `crypto/aes128/aes128.hpp`
3. `crypto/aes128/c_bind.cpp`
4. `crypto/aes128/c_bind.hpp`

### Circuit-Friendly AES-128 Implementation
5. `stdlib/encryption/aes128/aes128.cpp`
6. `stdlib/encryption/aes128/aes128.hpp`

### ACIR Integration
7. `dsl/acir_format/aes128_constraint.cpp`
8. `dsl/acir_format/aes128_constraint.hpp`

### Lookup Tables
9. `stdlib_circuit_builders/plookup_tables/aes128.hpp`

## Summary of Module

The `aes128` module provides both native and circuit-friendly implementations of the AES-128 block cipher with CBC (Cipher Block Chaining) mode. The native implementation in `crypto/aes128` provides standard AES-128 encryption/decryption for general use, including C bindings for external interfaces. The circuit-friendly implementation in `stdlib/encryption/aes128` enables AES-128 encryption to be proven inside arithmetic circuits using lookup tables to represent the S-box operations efficiently. The ACIR format integration allows AES-128 constraints to be specified in Noir programs, and the plookup tables module provides the lookup table definitions needed for efficient in-circuit S-box lookups.

## Test Files
1. `crypto/aes128/aes128.test.cpp`
2. `stdlib/encryption/aes128/aes128.test.cpp`

## Security Mechanisms

1. `boomerang_value_detection/graph_description_aes128.test.cpp`
   - Boomerang value detection: verifies no under-constrained variables
