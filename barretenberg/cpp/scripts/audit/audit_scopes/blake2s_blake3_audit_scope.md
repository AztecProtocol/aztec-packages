# BLAKE2s + BLAKE3 Audit Scope

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 4a956ceb179c2fe855e4f1fd78f2594e7fc3f5ea

### Files to audit

#### Native implementation
1. ```barretenberg/cpp/src/barretenberg/crypto/blake2s/blake2s.hpp```
2. ```barretenberg/cpp/src/barretenberg/crypto/blake2s/blake2s.cpp```
3. ```barretenberg/cpp/src/barretenberg/crypto/blake2s/blake2-impl.hpp```
4. ```barretenberg/cpp/src/barretenberg/crypto/blake3s/blake3s.hpp```
5. ```barretenberg/cpp/src/barretenberg/crypto/blake3s/blake3s.tcc```
6. ```barretenberg/cpp/src/barretenberg/crypto/blake3s/blake3-impl.hpp```

#### Stdlib circuit implementation

7. ```barretenberg/cpp/src/barretenberg/stdlib/hash/blake2s/blake2s.hpp```
8. ```barretenberg/cpp/src/barretenberg/stdlib/hash/blake2s/blake2s.cpp```
9. ```barretenberg/cpp/src/barretenberg/stdlib/hash/blake3s/blake3s.hpp```
10. ```barretenberg/cpp/src/barretenberg/stdlib/hash/blake3s/blake3s.cpp```
11. ```barretenberg/cpp/src/barretenberg/stdlib/hash/blake2s/blake_util.hpp```

#### Lookup related
12. ```barretenberg/cpp/src/barretenberg/stdlib/primitives/plookup/plookup.cpp```
    - for `lookup_read<Builder>::get_lookup_accumulators` and its path from thereon
13. ```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp```
```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.cpp```
    - for `ReadData<bb::fr> get_lookup_accumulators`
14. ```barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/blake2s.hpp```
    - for BLAKE tables such as `BLAKE_XOR`, `BLAKE_XOR_ROTATE_16`, `BLAKE_XOR_ROTATE_8`, etc.

#### DSL/ACIR format
15. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/blake2s_constraint.hpp```
16. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/blake2s_constraint.cpp```
17. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/blake3_constraint.hpp```
18. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/blake3_constraint.cpp```

#### Tests
19. ```barretenberg/cpp/src/barretenberg/crypto/blake2s/blake2s.test.cpp```
    - a set of test vectors that cover all message lengths from 0 to 72 bytes
20.  ```barretenberg/cpp/src/barretenberg/stdlib/hash/blake2s/blake2s.test.cpp```
      - a set of test vectors that cover varying message lengths up to 72 bytes including (powers of 2) boundaries, tested against the native implementation hash
      -  single and double block tests
      -  all witness, all constant and witness+constant message as input
21. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/blake2s_constraint.test.cpp```
    - ACIR integration test
22. ```barretenberg/cpp/src/barretenberg/crypto/blake3s/blake3s.test.cpp```
    - a set of test vectors that cover all message lengths from 0 to 72 bytes
    - subset (unkeyed hash mode, with varying message length $\leq$ 1024 bytes) of official BLAKE3 test vectors
    - a test to check that inputs greater than 1024 bytes trigger the intended assertion
23. ```barretenberg/cpp/src/barretenberg/stdlib/hash/blake3s/blake3s.test.cpp```
    - a set of test vectors that cover varying message lengths up to 72 bytes including (powers of 2) boundaries.
    - single and double block tests
    - all witness, all constant and witness+constant message as input
24. ```barretenberg/cpp/src/barretenberg/dsl/acir_format/blake3_constraint.test.cpp```
    - ACIR integration test



### Summary of the module
#### BLAKE2s
Implements the unkeyed, sequential BLAKE2s and outputs a 32 byte hash. XOR+Rotate operations are implemented via lookups. The relevant files related to lookups used in BLAKE are mentioned above.

#### BLAKE3
A restricted variant of BLAKE3 with inputs limited to $\leq$ 1024 bytes that generates a 32 byte hash. This kind of constraint on the input size simplifies the code and helps get rid of the recursive merkle-tree like operations on chunks (data of size 1024 bytes). This is because in Barretenberg, BLAKE3 is only used to hash inputs of size 32 bytes (or lesser).

### Documentation

BLAKE2s: https://www.blake2.net/blake2.pdf

BLAKE3: https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf

Lookup tables: https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/plookup_tables/README.md

### Note
Previously, certain inputs were pushing the addition overflows in `g` to beyond 3 bits (where `add_normalize` can tolerate up to 3 bits of overflow), causing failures. This has been addressed by calling `add_normalize` in the second half of every call to `g` to ensure that the overflow doesn't go beyond 3 bits. The input that was causing failures earlier has been added as a test case now. A detailed description of the issue can be found here: https://hackmd.io/@aztec-network/SyTHLkAWZx.
