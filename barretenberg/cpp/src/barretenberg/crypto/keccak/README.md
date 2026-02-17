# Keccak
This module implements **Keccak-256** based on the **Keccak-f[1600]** permutation.
It uses **capacity = 512 bits**, **rate = 1088 bits** (1600=rate+capacity) and the **Keccak domain suffix `0x01`** (not the SHA-3 `0x06`).
This module includes:
- Keccak-f[1600] permutation (`ethash_keccakf1600`) over a 1600-bit state (25 lanes of 64-bits each).
- A Keccak-256 hash function (`ethash_keccak256`).


## Specification
- NIST FIPS 202: defines Keccak-f[1600] (as KECCAK-p[1600,24]) and the sponge construction.
  - https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.202.pdf


## Overview

**Keccak-f[1600] Permutation** (24 Rounds)

Operates on a 1600-bit state (which is 25 lanes of 64 bits each). The state is represented as a 5×5 matrix of 64-bit lanes `A[x,y]` for `x,y ∈ {0,1,2,3,4}`, where `state[5*y + x]` corresponds to lane `A[x,y]`.

Each round applies the following five steps. All indices are taken modulo 5.

1. **θ (Theta):** compute column parities `C[x] = A[x,0] ⊕ A[x,1] ⊕ A[x,2] ⊕ A[x,3] ⊕ A[x,4]`, then `D[x] = C[x−1] ⊕ ROT(C[x+1], 1)`, and update every lane: `A[x,y] = A[x,y] ⊕ D[x]`.
2. **ρ (Rho):** rotate each lane by a fixed offset, i.e., `A[x,y] = ROT(A[x,y], r[x,y])`.
3. **π (Pi):** permute lane positions by moving lane at position `[x,y]` to `[y, (2x + 3y)]`.
4. **χ (Chi):** apply non-linear operations in each row, i.e., `A[x,y] = B[x,y] ⊕ ((¬B[x+1,y]) ∧ B[x+2,y])`. Here `B` is the output after applying π.
5. **ι (Iota):** XOR the round constant into lane (0,0), i.e., `A[0,0] = A[0,0] ⊕ RC[round]`.

**Keccak-256**

1. Initialize a 1600-bit state to zero.
2. Absorb the input message in 136-byte blocks (136 bytes = 1088-bit rate), XORing each block into the state and applying Keccak-f[1600] after every full block.
3. Apply padding using Keccak pad10*1 with suffix `0x01`. That is, append byte `0x01` after the final message byte, pad with zeros to the last bit of the 136-byte block, set the final bit to `1`. All lanes are 64-bit little-endian words.
4. Apply a final Keccak-f[1600] permutation.
5. Output the first 32 bytes of state.


## Test Vectors
Test vectors generated using the keccak reference implementation (https://github.com/XKCP/XKCP) for testing the Keccak-f[1600] (`ethash_keccakf1600`) permutation.
- Input state: all zero
- Input state: all zero except `state[7] = 0x01`
- Input state: random

For testing Keccak-256, we use commonly used test vectors for ASCII messages "" and "abc".
