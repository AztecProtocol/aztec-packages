# Handoff Context: Debugging g1/grumpkin Scalar Multiplication Failure

## Branch: `rk/splitting-scalars-edge-case`

## What was done
We fixed a bug in the GLV endomorphism scalar splitting algorithm in `field_declarations.hpp`.
The fix detects when k2 is negative (upper limbs nonzero after modular reduction) and corrects it
by adding `endo_minus_b1`. The fix was applied from `git stash pop stash@{0}`.

### Fix location
**`barretenberg/cpp/src/barretenberg/ecc/fields/field_declarations.hpp`** — in `split_into_endomorphism_scalars` (1-arg version that returns a pair):
```cpp
field t1 = (q2_lo - q1_lo).reduce_once();

// k2 (= t1) can be slightly negative for ~2^{-64} of inputs.
// When negative, t1 = k2 + r is 254 bits (upper limbs nonzero).
// Fix: decrement c1 by 1, equivalent to adding |b1| to k2.
if (t1.data[2] != 0 || t1.data[3] != 0) {
    t1 = (t1 + endo_minus_b1).reduce_once();
}
```

## What passes
- **`BN254Fr::SplitEndomorphismNegativeK2`** — PASSES. Tests field-level splitting only (k == k1 - k2*lambda).
- **`BN254Fq::SplitEndomorphismNegativeK2`** — PASSES. Same but for Fq.

## What fails
- **`g1::ScalarMulNegativeK2Regression`** — FAILS. Tests actual EC scalar multiplication (operator*) against naive double-and-add.
- **`grumpkin::ScalarMulNegativeK2Regression`** — FAILS (same pattern).

These tests do `g1::one * base_scalar` and compare against `naive_scalar_mul(g1::one, base_scalar)`.

## Primary hypothesis: Precompiled Header (PCH) caching

`field_declarations.hpp` is listed as a precompiled header in:
**`barretenberg/cpp/src/barretenberg/ecc/CMakeLists.txt`** — look for `target_precompile_headers`.

After applying the stash, the first build said "ninja: no work to do". After `touch field_declarations.hpp`,
a rebuild happened (32 files), but the g1/grumpkin tests STILL fail. The PCH may have cached the old
version and the touch didn't invalidate it properly.

**To test this hypothesis:** Do a clean rebuild of `ecc_tests`:
```bash
cd /mnt/user-data/raju/aztec-packages2/barretenberg/cpp/build
cmake --build . --target ecc_tests -j$(nproc) --clean-first
```
Or more targeted: find and delete PCH-related cache files:
```bash
find /mnt/user-data/raju/aztec-packages2/barretenberg/cpp/build -name "*.pch" -o -name "*.gch" | head -20
```

## Alternative hypothesis: Wrong `split_into_endomorphism_scalars` overload

There are TWO versions of `split_into_endomorphism_scalars`:
1. **1-arg version** (returns `std::pair<field, field>`) — THIS IS THE ONE WE FIXED
2. **3-arg version** (takes k, k1, k2 by reference) — dispatches to either the 1-arg version OR `split_into_endomorphism_scalars_384` depending on `modulus_3`

The `operator*` in **`barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp:679`** calls:
```cpp
auto [k1, k2] = Fr::split_into_endomorphism_scalars(converted_scalar);
```
This is the 1-arg version (the fixed one). Both Fr and Fq have `modulus_3 < 0x4000000000000000`.

BUT: verify this is actually calling the right function. Maybe there's inlining/template issues.

## Alternative hypothesis: The fix itself is incomplete for the EC mul path

The 1-arg `split_into_endomorphism_scalars` also adjusts t2 (k1). Check if the fix only
fixes t1 (k2) but t2 (k1) also needs adjustment. In the current fix, when we add
`endo_minus_b1` to t1, we do NOT adjust t2. But the math requires:
- k1_new = k1 - a1 (i.e., t2 should also change)
- k2_new = k2 + |b1|

Look at whether the 1-arg version returns t2 as k1 and whether the caller expects
both to be adjusted.

## Key files to examine
1. `barretenberg/cpp/src/barretenberg/ecc/fields/field_declarations.hpp` — the fix location
2. `barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp` — `operator*` at ~line 679
3. `barretenberg/cpp/src/barretenberg/ecc/CMakeLists.txt` — PCH configuration
4. `barretenberg/cpp/src/barretenberg/ecc/fields/field_impl.hpp` — may contain actual implementation
5. `barretenberg/cpp/src/barretenberg/ecc/curves/bn254/fr.hpp` — defines `endo_minus_b1_lo`, `endo_minus_b1_mid`
6. `barretenberg/cpp/src/barretenberg/ecc/curves/bn254/g1.test.cpp` — failing test
7. `barretenberg/cpp/src/barretenberg/ecc/curves/grumpkin/grumpkin.test.cpp` — failing test

## Build commands
```bash
cd /mnt/user-data/raju/aztec-packages2/barretenberg/cpp/build
cmake --build . --target ecc_tests -j$(nproc)
./bin/ecc_tests --gtest_filter="g1.ScalarMulNegativeK2Regression"
./bin/ecc_tests --gtest_filter="grumpkin.ScalarMulNegativeK2Regression"
./bin/ecc_tests --gtest_filter="BN254Fr.SplitEndomorphismNegativeK2"
./bin/ecc_tests --gtest_filter="BN254Fq.SplitEndomorphismNegativeK2"
```

## Test boundary scalars
For BN254 Fr (used in g1 test):
```
m=1: {0x01624731e1195570, 0x3ba491482db4da14, 0x59e26bcea0d48bac, 0x0}
m=2: {0x02c48e63c232aadf, 0x774922905b69b428, 0xb3c4d79d41a91758, 0x0}
m=3: {0x0426d595a34c004e, 0xb2edb3d8891e8e3c, 0x0da7436be27da304, 0x1}
```

For BN254 Fq / Grumpkin Fr (used in grumpkin test):
```
m=1: {0x71922da036dca5f4, 0xd970a56127fb8227, 0x59e26bcea0d48bac, 0x0}
m=2: {0xe3245b406db94be8, 0xb2e14ac24ff7044e, 0xb3c4d79d41a91759, 0x0}
m=3: {0x54b688e0a495f1dc, 0x8c51f02377f28676, 0x0da7436be27da306, 0x1}
```

## Summary
The field-level fix works (Fr/Fq splitting tests pass), but EC scalar multiplication still
fails. Either (a) PCH caching is serving stale code, or (b) the fix is incomplete — it fixes
k2 but doesn't correspondingly adjust k1, meaning `k1 - k2*lambda != k` still holds at the
field level (which passes!) but the actual 128-bit windows used in the windowed scalar mul
are wrong because k1 wasn't adjusted. Investigate both angles.
