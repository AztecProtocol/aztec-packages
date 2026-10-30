# Blake3s (BLAKE3, single chunk)

## Specification
- https://github.com/BLAKE3-team/BLAKE3

## Overview
This module provides a circuit-friendly implementation of BLAKE3 over 32-bit words. It hashes a single chunk of at most 1024 bytes and produces a 32-byte digest. Longer input aborts at circuit-construction time (`BB_ASSERT_LTE`); it is not a circuit constraint.

The implementation processes the chunk as follows:
- input is split into 64-byte blocks and processed sequentially,
- the chunk chaining value (CV) is updated per full block, and
- the final output is computed by applying the BLAKE3 output function to the last (possibly partial) block.

It does not implement the full tree-hashing mode (i.e., no parent-node chaining / Merkle-tree reduction), and it does not use keyed hashing or key-derivation modes.
BLAKE3’s compression is similar to BLAKE2s, wherein it operates on a 16-word state, mixes message words using additions, XORs and rotations, and updates an 8-word chaining value (CV).

## Implementation
The implementation maintains a `blake3_hasher` with:
- `cv[8]`: chaining value (8×32-bit),
- `buf`: a 64-byte buffer for the current block,
- `buf_len`: number of bytes currently buffered,
- `blocks_compressed`: number of full 64-byte blocks processed so far,
- `key[8]`: key words (unused: no keyed or derive-key mode), and
- `flags`: base flags (always 0). The per-block flags `CHUNK_START`, `CHUNK_END` and `ROOT` are added at compression time.

The IV is the standard 8×32-bit initialization vector.

For each 64-byte block, the implementation first runs the core compression (`compress_pre`) to compute the mixed internal state. For intermediate blocks this state is folded back into the chaining value via `compress_in_place`. For the final block, the state is fed into the BLAKE3 output function (`compress_xof`) to produce the hash output.

### Compression function (`compress_pre`)
The compression function mixes an 8-word CV, a 16-word internal state, a 64-byte message block, the block length, and flags. It
- loads 16 message words from the 64-byte block via `field_ct(block.slice(i * 4, 4).reverse())`,
- initializes the 16-word working state from the CV, IV, block length, and flags, and
- runs 7 rounds of the shared `round_fn` helper in `blake_util.hpp` with the BLAKE3 message schedule.

### CV update (`compress_in_place`)
`compress_in_place` computes the next chaining value as:
- `cv[i] = state[i] XOR state[i+8]` for `i = 0..7`, implemented via the `BLAKE_XOR` lookup table,
- the lookup output is constrained to the correct 32-bit result, so any intermediate overflow in `state` is discarded at this boundary.

### Output function (`compress_xof`) and finalization
`compress_xof` produces a 64-byte output (16×32-bit words) written into a `byte_array`:
- words `0-7` are `state[i] XOR state[i+8]` (same as CV update),
- words `8-15` are `state[i+8] XOR cv[i]`,
where each 32-bit word is converted to 4 bytes via `byte_array(field, 4)` (which range-constrains each output byte).

Finalization (`hasher_finalize`) sets `CHUNK_START` iff `blocks_compressed == 0` (via `maybe_start_flag`). It then applies the BLAKE3 output function to the final block with the `CHUNK_END` and `ROOT` flags set. `compress_xof` computes the 64-byte output, and the first 32 bytes are the hash digest.

### 32-bit semantics
Message words and the shared `g` mixing step keep 32-bit semantics the same way as Blake2s; see [Blake2s](../blake2s/README.md#shared-mixing-function-blake_utilhpp). The Blake3s-specific output words:
- 32-bit chaining/output words:
  - CV updates in `compress_in_place()` are computed via XOR lookup tables, whose outputs are constrained to the correct 32-bit results.
  - When producing output bytes in `compress_xof()`, each 32-bit word is converted into 4 bytes using `byte_array(field, 4)`, which range-constrains each output byte to 8 bits.

## API
- `bb::stdlib::Blake3s<Builder>::hash(const byte_array<Builder>& input)`
- Inputs/outputs are modeled as `byte_array`, i.e., an in-circuit byte vector (each element range-constrained to 8 bits).
- Inputs can be at most 1024 bytes long.

