# Pedersen Hash Audit Scope

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 8c1bc925461f1ed6f3f53824646c6e971b8c6af6

### Files to audit

#### Native implementation
1. ```barretenberg/cpp/src/barretenberg/crypto/pedersen_hash/pedersen.hpp```
2. ```barretenberg/cpp/src/barretenberg/crypto/pedersen_hash/pedersen.cpp```
3. ```barretenberg/cpp/src/barretenberg/crypto/pedersen_commitment/pedersen.hpp```
4. ```barretenberg/cpp/src/barretenberg/crypto/pedersen_commitment/pedersen.cpp```
5. ```barretenberg/cpp/src/barretenberg/crypto/generators/generator_data.hpp```

### Summary of the module

Pedersen hash is a cryptographic commitment scheme based on elliptic curve cryptography. The implementation uses the Grumpkin curve (a companion curve to BN254) for efficient operations.

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

Key features:
- Protection against length-extension attacks via the `n * [h]` term
- Ensures output is never the point at infinity
- Uses precomputed generator points for efficiency
- Based on the hardness of the discrete logarithm problem

#### Tests
- ```barretenberg/cpp/src/barretenberg/crypto/pedersen_hash/pedersen.test.cpp```
- ```barretenberg/cpp/src/barretenberg/crypto/generators/generator_data.test.cpp```

### Documentation

Pedersen commitments: https://en.wikipedia.org/wiki/Commitment_scheme#Pedersen_commitment
