# Poseidon2 Native Implementation

Poseidon2 hash function for BN254 scalar field. Reference: https://eprint.iacr.org/2023/323

## Usage Contexts

### Native C++ (this directory)
Fast hashing outside circuits: Merkle trees, protocol operations, witness generation.

### Circuit (`stdlib/hash/poseidon2/`)
The circuit implementation uses native Poseidon2 to compute witness values, then records them into custom gates. The round function is not re-implemented with arithmetic gates. The canonical circuit documentation, including the Mega K=4 quad-internal layout and soundness argument, lives in `stdlib/hash/poseidon2/README.md`.

### bb.js (WASM)
Client-side hashing in Node.js and browser via WASM. `bbapi/bbapi_crypto.{hpp,cpp}` exposes the msgpack commands `Poseidon2Hash`, `Poseidon2Permutation` and `Poseidon2AbsorbChain` to `bb.js`. The TypeScript wrappers live in aztec-labs-eng/aztec-node (`yarn-project/foundation/src/crypto/poseidon/`); the sequencer, PXE and wallet use them for hashes that must match on-chain verification.

## Files

| File | Purpose |
|------|---------|
| `poseidon2.hpp/cpp` | Public API: `Poseidon2<Params>::hash(input)` |
| `poseidon2_permutation.hpp` | Permutation: 4+4 external rounds, 56 internal rounds, used by stdlib for witness computation |
| `poseidon2_params.hpp` | BN254 parameters: t=4, round constants, MDS diagonal |
| `poseidon2_quad_params.hpp` | Vandermonde and closed-form constants for the Mega K=4 quad-internal layout |
| `poseidon2_cpp_params.sage` | Parameter generator |
| `sponge/sponge.hpp` | Sponge construction (see "The Sponge Construction" in `stdlib/hash/poseidon2/README.md`) |
| `poseidon2.test.cpp`, `poseidon2_permutation.test.cpp`, `poseidon2_quad_closed_form.test.cpp` | Native tests |
| `bbapi/bbapi_crypto.{hpp,cpp}` (outside this directory) | msgpack commands `Poseidon2Hash`, `Poseidon2Permutation`, `Poseidon2AbsorbChain` exposed to bb.js |

## WASM API

| bbapi command | Input | Output |
|---------------|-------|--------|
| `Poseidon2Hash` | `std::vector<fr> inputs` | `fr hash` (variable-length hash) |
| `Poseidon2Permutation` | `std::array<fr, 4> inputs` | `std::array<fr, 4> outputs` |
| `Poseidon2AbsorbChain` | sponge state, plus bytes of concatenated 3-element blocks (32-byte big-endian fields) | sponge state |

The array type enforces exactly 4 permutation inputs. The raw permutation is exposed because:
- The AVM simulator needs it for the `POSEIDON2PERM` opcode (aztec-node `yarn-project/simulator`)
- The blob library uses it for custom sponge constructions (aztec-node `yarn-project/blob-lib`)
- It matches Noir's `std::hash::poseidon2_permutation` builtin

## Validation

Native tests: `Poseidon2Permutation.{TestVectors,BasicTests,ConsistencyCheck}`, `Poseidon2.{HashBasicTests,HashConsistencyCheck,AbsorbBlocks*}`, and `Poseidon2QuadClosedForm.*`.

Differential testing in `stdlib/hash/poseidon2/poseidon2.test.cpp`:
1. Tests native against independent vectors from https://github.com/zemse/poseidon2-evm
2. Verifies circuit and native produce identical outputs

## Parameters (BN254)

- State size: t = 4
- S-box: x^5
- Rounds: 8 full (4+4) + 56 partial = 64 total
- Domain separation: IV = (input_length << 64)
