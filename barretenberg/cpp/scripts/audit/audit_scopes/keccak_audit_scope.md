# External Audit Scope: Keccak

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD

### Files to audit

#### Native implementation
1. ```barretenberg/cpp/src/barretenberg/crypto/keccak/keccak.hpp```
2. ```barretenberg/cpp/src/barretenberg/crypto/keccak/keccak.cpp```
3. ```barretenberg/cpp/src/barretenberg/crypto/keccak/keccakf1600.cpp```
4. ```barretenberg/cpp/src/barretenberg/crypto/keccak/hash_types.hpp```

#### Stdlib circuit implementation
5. ```barretenberg/cpp/src/barretenberg/stdlib/hash/keccak/keccak.hpp```
6. ```barretenberg/cpp/src/barretenberg/stdlib/hash/keccak/keccak.cpp```

#### Lookup tables
7. ```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/keccak/keccak_input.hpp```
8. ```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/keccak/keccak_output.hpp```
9. ```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/keccak/keccak_theta.hpp```
10. ```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/keccak/keccak_rho.hpp```
11. ```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/keccak/keccak_chi.hpp```

#### DSL/ACIR format
12. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/keccak_constraint.hpp```
13. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/keccak_constraint.cpp```

#### Tests
14. ```barretenberg/cpp/src/barretenberg/crypto/keccak/keccak.test.cpp```
    - 3 test vectors generated using the keccak reference implementation (https://github.com/XKCP/XKCP) for testing the Keccak-f[1600] permutation
15.  ```barretenberg/cpp/src/barretenberg/stdlib/hash/keccak/keccak.test.cpp```
      - test to check that the in-circuit and native permutation match on a full 25-lane state
      - test to check that `KECCAK_FORMAT_INPUT` lookup correctly maps 64-bit binary input to a sparse base-11 form and extracts the MSB
      - test to check that `KECCAK_FORMAT_OUTPUT` lookup correctly converts sparse base-11 input back to 64-bit binary integers
      - test to check that `KECCAK_THETA_OUTPUT` lookup correctly normalizes outputs within `theta`'s computation
      - test to check that `normalize_and_rotate` correctly normalizes base-11 inputs, applies the lane-specific bit rotation, and returns the expected output
      - test to check that `KECCAK_CHI_OUTPUT` lookup correctly normalizes outputs within `chi`'s computation
16. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/keccak_constraint.test.cpp```
    - ACIR integration test


### Summary of the module
The Keccak module implements the Keccak-f[1600] permutation inside the circuit, using a base-11 sparse representation of 64-bit lanes plus plookup tables to be used for the theta, rho, pi, chi and iota steps. It provides a `permutation_opcode` method that takes a 25-lane state, applies the full Keccak-f[1600] permutation, and generates an output state consistent with the native `ethash_keccakf1600` implementation.

### Documentation
NIST FIPS 202: defines Keccak-f[1600] (as KECCAK-p[1600,24]) and the sponge construction.
  - https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.202.pdf


### Security Mechanism
1. ```barretenberg/cpp/src/barretenberg/stdlib/hash/keccak/keccak.fuzzer.cpp```
    - Differential fuzzer: circuit vs native
