# Negative k2 in GLV Scalar Splitting: Analysis

## Summary

The GLV scalar splitting algorithm in `split_into_endomorphism_scalars` can produce
a negative `k2` for certain inputs. When this happens, `t1 = k2 mod r` is a 254-bit
number, and the 128-bit truncation `{t1.data[0], t1.data[1]}` extracts the wrong
value. Reconstruction `k1 - λ·k2 ≡ k (mod r)` then fails.

## Setup

The algorithm computes `k2 = c1·b1 + c2·b2 = -c1·|b1| + c2·b2`, where:

    c1 = (endo_g2 · k) >> 256   ≈ ⌊k·b2 / r⌋
    c2 = (endo_g1 · k) >> 256   ≈ ⌊k·|b1| / r⌋

and the basis constants are:

    |b1| = 0x6f4d8248eeb859fc8211bbeb7d4f1128   (127 bits)
    b2   = 0x89d3256894d213e3                     (64 bits)

## Why k2 can be negative

With exact division, `k2 = δ1·|b1| - δ2·b2` where `δ1, δ2 ∈ [0,1)` are rounding
errors. This is negative when `δ2·b2 > δ1·|b1|`, i.e., when `δ1` is tiny relative
to `δ2`. Since `|b1|/b2 ≈ 2^63`, this requires `δ1 < δ2 · 2^{-63}`.

## The concrete trigger

`k2` goes negative at the boundary where `c1` ticks from 0 to 1, i.e.,
`k ≈ r/b2 ≈ 2^190`. Just below this threshold, `c1 = 0` and
`k2 = c2·b2 ≥ 0`. Just above, `c1 = 1` and `k2 = c2·b2 - |b1|`, which is
slightly negative (magnitude ~`2^64`).

The fixed-point approximation error does not save us: at this boundary,
`c1_approx = c1_exact = 1` and `c2_approx = c2_exact`.

### Concrete failing input (BN254 Fr)

    k = 2203960485148121921214827779877635328500483760608362714480
      = ⌈2^256 / endo_g2⌉   (the smallest k for which c1_approx = 1)

At this k:
- `c1 = 1`, `c2 = 14896984101578546642`
- `k2 = c2·b2 - |b1| = -4965661367192848882` (negative, magnitude ~63 bits)
- `t1 = k2 mod r` is 254 bits
- 128-bit truncation produces garbage
- **Reconstruction fails**

## How many inputs are affected

For each value of `c1 = m ≥ 1`, there is a contiguous range of ~`2^{126}` values
of `k` where `c2·b2 < m·|b1|` (i.e., `k2 < 0`). There are ~`b2 ≈ 2^{64}` distinct
values of `c1`, so the total number of bad inputs is ~`2^{190}` out of `r ≈ 2^{254}`,
a fraction of ~`2^{-64}`.

This is far too rare for random testing to discover (~`2^{64}` samples needed), but
the affected inputs are deterministic and easily constructed.

## Proposed fix

### Why negating k2 doesn't work

A tempting fix is to detect negative `k2` (upper limbs nonzero after `mod r`)
and negate it. But the pair `(k1, k2)` is coupled: `k ≡ k1 - λ·k2 (mod r)`.
Negating `k2` to `|k2|` requires `k1' = k + λ·|k2|`, which is ~192 bits —
far too large for 128-bit truncation. You cannot flip the sign of one scalar
independently.

### The correct fix: decrement c1

The root cause is that `c1` is too large by 1 at certain boundaries. The fix
is to detect the negative `k2` and effectively decrement `c1` by 1. In the
lattice decomposition `k2 = c2·b2 - c1·|b1|`, decrementing `c1` adds `|b1|`
to `k2`, making it positive (~127 bits). The corresponding `k1` shifts by
`-a1` (~64 bits), staying well within 128 bits.

In the code, `q1 = c1 * |b1|`, so decrementing `c1` means subtracting `|b1|`
from `q1`, which is the same as adding `|b1|` to `t1 = q2 - q1`:

```cpp
field t1 = (q2_lo - q1_lo).reduce_once();

// k2 (= t1) can be slightly negative for ~2^{-64} of inputs.
// When negative, t1 = k2 + r is 254 bits (upper limbs nonzero).
// Fix: decrement c1 by 1, equivalent to adding |b1| to k2.
// This shifts k2 by +|b1| (~127 bits, now positive) and k1 by -a1 (~64 bits),
// keeping both within 128 bits.
if (t1.data[2] != 0 || t1.data[3] != 0) {
    t1 = (t1 + endo_minus_b1).reduce_once();
}

field beta = cube_root_of_unity();
field t2 = (t1 * beta + input).reduce_once();
return {
    { t2.data[0], t2.data[1] },
    { t1.data[0], t1.data[1] },
};
```

### Why this works

- **Detection**: `t1.data[2] != 0 || t1.data[3] != 0` is unambiguous because
  the lattice bound guarantees `|k2| < 2^128`. If `k2 >= 0` it fits in 128 bits
  (upper limbs zero). If `k2 < 0`, `t1 = k2 + r` is ~254 bits (upper limbs
  nonzero).

- **Correction**: Adding `|b1|` to `t1 = k2 + r` gives `(k2 + |b1|) + r`.
  Since `k2 + |b1| >= 0` and `< 2^128 < r`, the `.reduce_once()` reduces it
  to `k2 + |b1|`, the corrected (positive) k2 value.

- **k1 stays in range**: The corrected `k1 = k + λ·(k2 + |b1|)` differs from
  the original by `λ·|b1| ≡ -a1 (mod r)` (lattice relation). Since `a1` is
  only 64 bits, `k1` stays well within 128 bits.

- **Algebraic correctness**: The corrected `(k1, k2)` still satisfies
  `k ≡ k1 - λ·k2 (mod r)` because we shifted by the lattice vector
  `(a1, b1)`, which satisfies `a1 + λ·b1 ≡ 0 (mod r)`.

Cost: one branch (almost never taken) and one 128-bit addition. No change to
the API or downstream WNAF consumption.

## Verification

The Python script `endomorphism_scalars.py` in this directory reproduces the bug.
The C++ test `SplitEndomorphismNegativeK2` in `bn254/fr.test.cpp` demonstrates
the failure with the concrete input above.
