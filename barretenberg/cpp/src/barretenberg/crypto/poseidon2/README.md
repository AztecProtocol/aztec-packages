# Poseidon2 Native Implementation

Poseidon2 hash function for BN254 scalar field. Reference: https://eprint.iacr.org/2023/323

## Usage Contexts

### Native C++ (this directory)
Fast hashing outside circuits: Merkle trees, protocol operations, witness generation.

### Circuit (`stdlib/hash/poseidon2/`)
The circuit implementation uses **native Poseidon2 to compute witness values**, then records them into custom gates. The round function is not re-implemented with arithmetic gates—instead, custom gate relations (`Poseidon2ExternalRelation`, `Poseidon2InternalRelation`) verify the witnesses satisfy Poseidon2 equations.

### TypeScript (`yarn-project/foundation/src/crypto/poseidon/`)
Client-side hashing in Node.js and browser via WASM. The TypeScript wrapper (`poseidon2Hash`, `poseidon2Permutation`) calls `c_bind.cpp` exports through `bb.js`. Used by sequencer, PXE, and wallet for computing hashes that must match on-chain verification.

## Files

| File | Purpose |
|------|---------|
| `poseidon2.hpp/cpp` | Public API: `Poseidon2<Params>::hash(input)` |
| `poseidon2_permutation.hpp` | Permutation: 4+4 external rounds, 56 internal rounds, used by stdlib for witness computation |
| `poseidon2_params.hpp` | BN254 parameters: t=4, round constants, MDS diagonal |
| `sponge/sponge.hpp` | Sponge construction (see "The Sponge Construction" in `stdlib/hash/poseidon2/README.md`) |
| `c_bind.cpp` | WASM exports with input validation |

## WASM API

```cpp
poseidon2_hash(inputs) → hash              // Variable-length hash
poseidon2_permutation(state[4]) → state[4] // Requires exactly 4 elements
poseidon2_hash_accumulate(inputs) → hash   // Requires at least 1 element
```

## Validation

Differential testing in `stdlib/hash/poseidon2/poseidon2.test.cpp`:
1. Tests native against independent vectors from https://github.com/zemse/poseidon2-evm
2. Verifies circuit and native produce identical outputs

## Parameters (BN254)

- State size: t = 4
- S-box: x^5
- Rounds: 8 full (4+4) + 56 partial = 64 total
- Domain separation: IV = (input_length << 64)
