# Blake2s


## Specification
- RFC 7693 (normative BLAKE2 specification): https://www.rfc-editor.org/rfc/rfc7693
- https://blake2.net


## Overview
This module provides a circuit-friendly implementation of unkeyed BLAKE2s (32-byte digest) over 32-bit words.

BLAKE2s hashes an arbitrary-length byte string by iterating a compression function over 64-byte input blocks. The implementation maintains a `blake2s_state` with:
- `h[8]`: chaining value (8×32-bit),
- `t[2]`: byte counter (low/high 32-bit limbs), and
- `f[2]`: finalization flags.

The IV is the standard 8×32-bit initialization vector.

For each 64-byte block, the compression function does the following:
- parses a 64-byte block into 16 message words `m[16]` (16×32-bit),
- initializes a working state matrix `v[16]` from the current `h`, `IV` constants, counter `t`, and flags `f`,
- applies 10 rounds of the `round_fn` function (adds, XORs, rotates) using message words from `m[16]` according to the BLAKE2s message schedule, and
- finally updates the chaining value as `h[i] = h[i] XOR v[i] XOR v[i+8]`.

After all full blocks are processed, the remaining bytes are handled as the final block with padding and the finalization flag set, and the 32-byte digest is produced from `h[0..7]`.


## Implementation
The circuit supports the Ultra and Mega builders.

### Shared mixing function (`blake_util.hpp`)
Blake2s and Blake3s share the `g` mixing step and `round_fn` in `blake_util.hpp`. Lookup tables compute XOR and rotate. Field additions compute adds; `add_normalize_unsafe` reduces them where a lookup input bound requires it. Every location that requires a 32-bit word is enforced either by normalization or by lookup outputs constrained to 32-bit values.

- 32-bit message words: `byte_array<Builder>` constrains each input byte to 8 bits. Message words `m[i]` are formed from 4 constrained bytes, so each `m[i]` is a well-defined 32-bit word. While the resulting field element is itself not range-constrained to 32 bits, correct 32-bit semantics are enforced at the boundaries via lookup outputs and normalization.
- 32-bit semantics with overflow: As a performance tradeoff, intermediate additions inside the mixing function `g` may temporarily produce values > `2^32` and are allowed to have an overflow of up to 3 bits. Where the algorithm requires a 32-bit word, the 32-bit semantics are ensured by:
    - normalization, using `add_normalize_unsafe(a, b, overflow_bits=3)` (`hash_utils::add_normalize_unsafe`, `stdlib/hash/hash_utils.hpp`), which forces the result to the low 32 bits of the sum, and introduces an overflow witness constrained to `overflow_bits` (here 3).
    - lookup tables, where outputs are constrained to the intended 32-bit result (normalization is applied as needed to keep lookup keys within the bound of up to 35-bits.)
- 32-bit chaining/output words: The chaining update `h[i] = h[i] XOR v[i] XOR v[i+8]` is computed via lookup tables, where the lookup outputs are constrained to the correct 32-bit results. When producing the final digest, converting each `h[i]` into 4 bytes (via `byte_array(field, 4)`) range-constrains the output bytes to 8 bits each.


### API
- `bb::stdlib::Blake2s<Builder>::hash(const byte_array<Builder>& input)`
- Inputs/outputs are modeled as `byte_array`, i.e., an in-circuit byte vector (each element range-constrained to 8 bits).

### Tests
- `blake2s.test.cpp` (unit tests) and `blake2s.fuzzer.cpp` (fuzzer).
