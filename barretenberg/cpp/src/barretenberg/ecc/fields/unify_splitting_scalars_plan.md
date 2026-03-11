# Plan: Kill the 384-bit splitting path, unify with 256-bit

## Background

`field_declarations.hpp` has two scalar-splitting algorithms:
- `split_into_endomorphism_scalars` (256-bit shift) — used by BN254 Fr/Fq
- `split_into_endomorphism_scalars_384` (384-bit shift) — used by secp256k1 Fr

The 384-bit path exists because it was believed the 256-bit shift lacks precision
for secp256k1's full 256-bit modulus. **This is wrong.** We proved (see
`endomorphism_scalars.py` §0) that for any `r < 2^256`, the 256-bit shift
approximation error is bounded to {0, -1} — identical to BN254. The actual
reason the existing 256-bit code fails for secp256k1 is only the **128-bit
truncation** at the output (`return { {t2.data[0], t2.data[1]}, ... }`), which
clips a 129th bit that appears ~26% of the time for secp256k1.

## What changes

### 1. Extract shared core: `compute_endomorphism_k2` in `field_declarations.hpp`

Pull the guts of the current `split_into_endomorphism_scalars` into a shared
helper that both paths call. Uses `mul_512` (raw integer multiply, no Montgomery
— faster since all operands are ≤128 bits with zero upper limbs).

```cpp
static field compute_endomorphism_k2(const field& input) {
    constexpr field endo_g1 = { Params::endo_g1_lo, Params::endo_g1_mid, Params::endo_g1_hi, 0 };
    constexpr field endo_g2 = { Params::endo_g2_lo, Params::endo_g2_mid, 0, 0 };
    constexpr field endo_minus_b1 = { Params::endo_minus_b1_lo, Params::endo_minus_b1_mid, 0, 0 };
    constexpr field endo_b2 = { Params::endo_b2_lo, Params::endo_b2_mid, 0, 0 };

    wide_array c1 = endo_g2.mul_512(input);
    wide_array c2 = endo_g1.mul_512(input);
    field c1_hi{ c1.data[4], c1.data[5], c1.data[6], c1.data[7] };
    field c2_hi{ c2.data[4], c2.data[5], c2.data[6], c2.data[7] };

    wide_array q1 = c1_hi.mul_512(endo_minus_b1);
    wide_array q2 = c2_hi.mul_512(endo_b2);
    field q1_lo{ q1.data[0], q1.data[1], q1.data[2], q1.data[3] };
    field q2_lo{ q2.data[0], q2.data[1], q2.data[2], q2.data[3] };

    return (q2_lo - q1_lo).reduce_once();
}
```

Why this works for secp256k1: `c1_hi` ≤ 126 bits, `endo_minus_b1` = 128 bits,
so `c1_hi * endo_minus_b1` ≤ 254 bits — fits in the low 256 bits of the
`wide_array`. Same for `c2_hi * endo_b2`. No overflow, no precision loss.

### 2. Rewrite BN254 128-bit path (unchanged behavior)

```cpp
static std::pair<std::array<uint64_t, 2>, std::array<uint64_t, 2>>
split_into_endomorphism_scalars(const field& k) {
    static_assert(Params::modulus_3 < MODULUS_TOP_LIMB_LARGE_THRESHOLD);
    field input = k.reduce_once();
    field t1 = compute_endomorphism_k2(input);

    // Negative-k2 fix: for ~2^{-64} of inputs, k2 is slightly negative
    // (wrapped to ~254 bits). Shift along lattice vector to make it positive.
    if (t1.data[2] != 0 || t1.data[3] != 0) {
        constexpr field endo_minus_b1 = { Params::endo_minus_b1_lo, Params::endo_minus_b1_mid, 0, 0 };
        t1 = (t1 + endo_minus_b1).reduce_once();
    }

    field t2 = (t1 * cube_root_of_unity() + input).reduce_once();
    return { { t2.data[0], t2.data[1] }, { t1.data[0], t1.data[1] } };
}
```

This is identical to the current code, just calling `compute_endomorphism_k2`
instead of inlining the logic.

### 3. Rewrite full-width path (replaces 384-bit)

```cpp
static void split_into_endomorphism_scalars(const field& k, field& k1, field& k2) {
    field input = k.reduce_once();
    field t1 = compute_endomorphism_k2(input);
    // No negative-k2 fix — caller handles signs (biggroup_nafs.hpp checks msb >= 129).
    k2 = -t1;
    k1 = (t1 * cube_root_of_unity() + input).reduce_once();
}
```

No `if constexpr` dispatch. No 384-bit path. The BN254 callers that go through
this overload (fr.test.cpp, fq.test.cpp, wnaf.test.cpp) still work because the
`else` branch previously unpacked the 2-limb result into a field anyway.

### 4. Delete `split_into_endomorphism_scalars_384` entirely

Remove the function. It is no longer called.

### 5. Update secp256k1.hpp: replace 384-bit constants with 256-bit constants

The current `endo_g1/g2` values in `secp256k1.hpp` FrParams are 384-bit-shift
constants (256 bits wide, using lo/mid/hi/hihi). Replace with 256-bit-shift
constants (128 bits wide, using lo/mid only, hi=0):

```
Current (384-bit shift):
  endo_g1_lo   = 0xE893209A45DBB031    endo_g1_mid  = 0x3DAA8A1471E8CA7F
  endo_g1_hi   = 0xE86C90E49284EB15    endo_g1_hihi = 0x3086D221A7D46BCD

  endo_g2_lo   = 0x1571B4AE8AC47F71    endo_g2_mid  = 0x221208AC9DF506C6
  endo_g2_hi   = 0x6F547FA90ABFE4C4    endo_g2_hihi = 0xE4437ED6010E8828

New (256-bit shift):
  endo_g1_lo   = 0x6F547FA90ABFE4C4    endo_g1_mid  = 0xE4437ED6010E8828
  endo_g1_hi   = 0x0                   (delete endo_g1_hihi)

  endo_g2_lo   = 0xE86C90E49284EB15    endo_g2_mid  = 0x3086D221A7D46BCD
  endo_g2_hi   = 0x0                   (delete endo_g2_hihi)
```

The `endo_minus_b1` and `endo_b2` values are unchanged (they're the lattice
vectors, independent of the shift).

NOTE: the naming convention is cross-paired:
  - `endo_g1` = floor((-b1) * 2^256 / r)  (paired with minus_b1)
  - `endo_g2` = floor(b2 * 2^256 / r)     (paired with b2)

This matches the existing BN254 convention (see `compute_splitting_constants`
in endomorphism_scalars.py).

### 6. Delete `endo_g1_hihi` / `endo_g2_hihi` references

- `secp256k1.hpp` FrParams: delete the two `hihi` fields
- `field_declarations.hpp`: remove the two lines reading `Params::endo_g1_hihi`
  and `Params::endo_g2_hihi` (they were only used in the now-deleted 384 fn)
- `secp256k1_endo_notes.hpp`: update or remove references to 384-bit constants

### 7. Update endomorphism_scalars.py

- In §12 (secp256k1 precomputed constants): change from 384-bit to 256-bit.
  Use `compute_splitting_constants` (already defined) instead of
  `compute_splitting_constants_384`. Verify the new constants match the new
  `.hpp` values.
- Delete `compute_splitting_constants_384` and `split_scalar_384` functions
  (no longer needed).
- Renumber sections as needed.
- Update §13 (splitting algorithm) to describe the 256-bit algorithm.
- The APPENDIX in `__main__` can be simplified or removed.

### 8. Update tests

- `secp256k1.test.cpp`: tests call `split_into_endomorphism_scalars(k, k1, k2)`.
  These should still pass — same API, the result may differ slightly (different
  c1/c2 due to different shift precision) but decomposition is always valid.
- `biggroup_secp256k1.test.cpp`: uses the split via `biggroup_nafs.hpp`. Should
  work unchanged.
- Run all existing tests to verify.

## Files to modify

| File | Change |
|------|--------|
| `ecc/fields/field_declarations.hpp` | Extract `compute_endomorphism_k2`, rewrite both `split_into_endomorphism_scalars` overloads, delete `split_into_endomorphism_scalars_384` |
| `ecc/curves/secp256k1/secp256k1.hpp` | Replace `endo_g1/g2` with 256-bit values, delete `hihi` fields |
| `ecc/curves/secp256k1/secp256k1_endo_notes.hpp` | Update/remove 384-bit references |
| `ecc/fields/endomorphism_scalars.py` | Switch secp256k1 to 256-bit constants, delete 384-bit functions |

## Proof that 256-bit shift is sufficient

For `g = floor(b · 2^256 / r)` and any `k ∈ [0, r)`:

Write `b · 2^256 = g · r + ε` where `0 ≤ ε < r`. Then:

    g·k / 2^256 = k·b/r − ε·k/(r·2^256)

Since `0 ≤ ε·k/(r·2^256) < r/2^256 < 1` (because r < 2^256):

    k·b/r − 1 < g·k/2^256 ≤ k·b/r

Taking floors: `floor(g·k/2^256) ∈ {floor(k·b/r), floor(k·b/r) − 1}`. QED.

This holds for **any** r < 2^256 — BN254 and secp256k1 alike.

## Empirical validation

`endomorphism_scalars.py` APPENDIX tested 200,540 inputs (including boundary
values, trigger inputs, continued fraction convergents, and random scalars):
- 0 failures
- c1/c2 errors always in {0, -1}
- max k1, k2 = 129 bits
- The 256-bit-shift full-width algorithm is correct for all tested inputs
