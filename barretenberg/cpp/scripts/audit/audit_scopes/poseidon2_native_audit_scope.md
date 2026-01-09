# Poseidon2 Audit Scope

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 4a956ceb179c2fe855e4f1fd78f2594e7fc3f5ea

### Files to audit

#### Native implementation
1. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2.hpp```
2. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2.cpp```
3. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2_permutation.hpp```
4. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2_params.hpp```
5. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/sponge/sponge.hpp```
6. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/c_bind.hpp```
7. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/c_bind.cpp```

#### Tests
8. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2.test.cpp```
    - Test vectors for native Poseidon2 implementation
9. ```barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2_permutation.test.cpp```
    - Test vectors for Poseidon2 permutation



### Summary of the module

Poseidon2 is a cryptographic hash function optimized for use in zero-knowledge proof systems. It is an improved version of the Poseidon hash function with better performance characteristics. The implementation uses a sponge construction with a permutation function based on substitution-permutation networks (SPNs). The hash function operates over finite fields and is particularly efficient when used in arithmetic circuits.

Key features:
- Sponge-based construction with configurable rate and capacity
- Optimized permutation function with external and internal rounds
- Supports BN254 scalar field parameters

### Documentation

Poseidon2 paper: https://eprint.iacr.org/2023/323
