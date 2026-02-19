#!/usr/bin/env python3
"""
BN254 GLV Endomorphism: Constants and Scalar Splitting Explained

This document explains the "splitting scalars" algorithm in Barretenberg. The first section
works explicitly with Fr, the scalar field of the BN254 elliptic curve.

Reference: Gallant, Lambert, Vanstone, "Faster Point Multiplication on Elliptic Curves" (2001)

NOTATION:
    ≈   "approximately equal" - values differ by a small rounding error
"""

# ====================================================================================
# § 1. INTRODUCTION
# ====================================================================================
#
# The BN254 elliptic curve admits an efficiently computable endomorphism φ that
# satisfies φ(P) = λ·P where λ is a cube root of unity in the scalar field Fr.
#
# This enables an optimization: any scalar multiplication k·P can be
# decomposed as:
#
#     k·P = k1·P - k2·φ(P)
#
# where k1, k2 are approximately 127 bits each (half the size of the original
# 254-bit scalar k). Since φ(P) is nearly free to compute (one Fq multiplication)
# and the scalars are half-sized, this significantly accelerates scalar multiplication.
#
# This document explains:
#   1. How the mathematical constants are derived
#   2. How the algorithm guarantees k ≡ k1 - λ·k2 (mod r), where k1 and k2 are short (~127-bit) values.

# ====================================================================================
# § 2. FIELD PARAMETERS (for Fr)
# ====================================================================================

# The scalar field modulus of BN254 (from bn254/fr.hpp)
r = 0x30644E72E131A029B85045B68181585D2833E84879B9709143E1F593F0000001

# Montgomery parameter: R = 2^256 mod r
# This is needed because fr.hpp stores values in Montgomery form
R = pow(2, 256, r)
R_inv = pow(R, -1, r)

# The cube root of unity λ ∈ Fr (from bn254/fr.hpp)
# CRITICAL: In Barretenberg, this value is stored in Montgomery form and must be converted!
# We maintain the montgomery form here to show that the values are compatible with those in Barretenberg.
cube_root_montgomery = (
    0x93e7cede4a0329b3 |
    (0x7d4fdca77a96c167 << 64) |
    (0x8be4ba08b19a750a << 128) |
    (0x1cbd5653a5661c25 << 192)
)

# Convert from Montgomery form to standard form
lambda_val = (cube_root_montgomery * R_inv) % r

# Verify that λ is a non-trivial cube root of unity.
assert (pow(lambda_val, 2, r) + lambda_val + 1) % r == 0, "λ² + λ + 1 ≡ 0 (mod r)"


# ====================================================================================
# § 3. THE LATTICE BASIS
# ====================================================================================
#
# To decompose k into short scalars k1, k2, we use a "nearest lattice vector" style of algorithm.
# First, consider the 2D lattice:
#
#     L = {(a, b) ∈ Z² : a + λ·b ≡ 0 (mod r)} = ker(Z² -> Z/rZ), (a, b) ↦ a + λ·b
#
# NOTE: any lattice point (a, b) ∈ L satisfies a ≡ -λ·b (mod r).
#
# The phrase "short basis for a lattice" means two vectors with small components. Here is
# our short basis.

a1 = 0x89d3256894d213e3                   # 64 bits
b1 = -0x6f4d8248eeb859fc8211bbeb7d4f1128  # 127 bits (negative)
a2 = 0x6f4d8248eeb859fd0be4e1541221250b  # 127 bits
b2 = 0x89d3256894d213e3                   # 64 bits

# NOTE: a remarkable feature of this short basis is that a1 == b2, and indeed -b1 is rather close to a2.

# Verify that the vectors are in the lattice: ai + λ·bi ≡ 0 (mod r)
assert (a1 + lambda_val * b1) % r == 0, "Lattice vector 1 must satisfy a1 + λ·b1 ≡ 0"
assert (a2 + lambda_val * b2) % r == 0, "Lattice vector 2 must satisfy a2 + λ·b2 ≡ 0"

# Verify the determinant: det(L) = a1·b2 - a2·b1 = -r ≡ 0 (mod r)
det = (a1 * b2 - a2 * b1)
assert abs(det) == r, "Lattice determinant ±r; hence for our vectors to be a lattice basis, they must have the same determinant (up to sign)"

# These constants will later be shown to match those in barretenberg. It is worth noting
# that in fr.hpp, we DO NOT store a1 or a2; it turns out we ONLY need b1 and b2.

# ====================================================================================
# § 4. PRECOMPUTED CONSTANTS FOR DIVISION-FREE COMPUTATION
# ====================================================================================
#
# The scalar splitting algorithm (Babai's nearest plane) requires computing:
#
#     c1 ≈ (k·b2) / r
#     c2 ≈ (k·(-b1)) / r
#
# Division by r is expensive. Instead, we _precompute_ fixed-point representations:
#
#     endo_g1 = ((-b1) · 2^256) // r
#     endo_g2 = (b2 · 2^256) // r
#
# Note that the above expressions, endo_g1 and endo_g2 DO NOT depend on k.
#
# Then: (endo_g2 · k) >> 256 ≈ (b2 · k) / r = c1
#       (endo_g1 · k) >> 256 ≈ ((-b1) · k) / r = c2
#
# The ≈ hides two rounding errors: the floor in computing endo_g2 (or endo_g1),
# and the floor in the >> 256 shift. However, the total error is at most 1.
# So c1, c2 are each off by at most 1 from the exact rational values.


def compute_splitting_constants(modulus, b1, b2):
    """
    Compute the precomputed constants for division-free scalar splitting.

    Returns (endo_g1, endo_g2, endo_minus_b1, endo_b2) matching fr.hpp
    """
    shift = 1 << 256
    endo_g1 = ((-b1) * shift) // modulus
    endo_g2 = (b2 * shift) // modulus
    endo_minus_b1 = (-b1) % modulus
    endo_b2 = b2 % modulus
    return endo_g1, endo_g2, endo_minus_b1, endo_b2


endo_g1, endo_g2, endo_minus_b1, endo_b2 = compute_splitting_constants(r, b1, b2)

# Verify these match the values in bn254/fr.hpp
expected_endo_g1 = 0x7a7bd9d4391eb18d | (0x4ccef014a773d2cf << 64) | (0x2 << 128)
expected_endo_g2 = 0xd91d232ec7e0b3d7 | (0x2 << 64)
expected_endo_minus_b1 = 0x8211bbeb7d4f1128 | (0x6f4d8248eeb859fc << 64)
expected_endo_b2 = 0x89d3256894d213e3

assert endo_g1 == expected_endo_g1, "endo_g1 must match fr.hpp"
assert endo_g2 == expected_endo_g2, "endo_g2 must match fr.hpp"
assert endo_minus_b1 == expected_endo_minus_b1, "endo_minus_b1 must match fr.hpp"
assert endo_b2 == expected_endo_b2, "endo_b2 must match fr.hpp"


# ====================================================================================
# § 5. THE SCALAR SPLITTING ALGORITHM
# ====================================================================================
#
# Given a scalar k, we compute (k1, k2) such that:
#     k ≡ k1 - λ·k2 (mod r),    |k1|, |k2| < 2^128
#
# DERIVATION (Babai's nearest plane on L):
#
# Find a lattice point (x, y) ∈ L close to (k, 0). Setting k1 = k - x, k2 = y,
# the lattice condition x + λ·y ≡ 0 (mod r) gives k1 - λ·k2 ≡ k (mod r).
#
# Writing (x, y) = c1·(a1, b1) + c2·(a2, b2), inverting the basis matrix
# against the target (k, 0) with det = r gives:
#
#     c1 = ⌊k·b2 / r⌋,    c2 = ⌊k·(-b1) / r⌋
#
# Note: neither a1 nor a2 appear, which is why we don't store them.
# Note: b1 is negative, hence the second expression is again non-negative.
# Note: we can think of (k1, k2) as the "error term" to a lattice approximation of (k, 0).
#
# APPROXIMATE BOUNDS: Let δ1, δ2 ∈ [0,1) be the rounding errors. A simple computation
# shows that k2 = c1·b1 + c2·b2 would be zero with exact division, so
# |k2| ≤ |δ1·b1| + |δ2·b2| < |b1| + |b2| < 2^128. Similarly |k1| < 2^128.
#
# WHAT THE NAIVE IMPLEMENTATION COMPUTES:
#
# k2: The implementation stores -b1 (not b1), so it computes
#     c2·b2 - c1·(-b1) = c1·b1 + c2·b2 = k2  (mod r)
#
# k1: Using the lattice relation ai ≡ -λ·bi (mod r), a simple computation
# shows c1·a1 + c2·a2 ≡ -λ·k2 (mod r), so k1 = k + λ·k2. Hence:
#     k2·λ + k = k1  (mod r)
#
# SUBTLETY — k2 CAN BE NEGATIVE:
#
# The bound |k2| < 2^128 guarantees the MAGNITUDE fits in 128 bits, but k2
# can be negative. When k2 < 0, the modular reduction gives t1 = k2 + r,
# which is ~254 bits. The 128-bit truncation then extracts garbage.
#
# Recall k2 = -c1·|b1| + c2·b2, where c1 and c2 are floors of rational
# values. Writing c1 = c1_exact - δ1, c2 = c2_exact - δ2 with δ ∈ [0,1):
#
#     k2 = -δ1·|b1| + δ2·b2
#
# This is negative when δ1·|b1| > δ2·b2. Since |b1|/b2 ≈ 2^63, this needs
# δ1 > δ2·2^{-63} — i.e., δ1 can be tiny but must be nonzero.
#
# This happens at boundaries where c1 "ticks up" to a new integer m: at
# k ≈ ceil(m · 2^256 / endo_g2), c1 jumps to m while c2·b2 hasn't grown
# enough to compensate, so k2 = c2·b2 - m·|b1| < 0.
#
# Frequency: for each of the ~b2 ≈ 2^64 values of c1, there is a contiguous
# range of ~2^{126} affected k values. Total: ~2^{190} / 2^{254} ≈ 2^{-64}
# fraction. Far too rare for random testing, but easily constructed.
#
# FIX: When t1 has bits above position 128 (in C++: t1.data[2] or t1.data[3]
# nonzero), we add |b1| to t1. This is equivalent to decrementing c1 by 1,
# shifting the decomposition by the lattice vector (a1, b1). In other words
# we change our "close lattice vector":
#
#     k2_new = k2 + |b1|    (now positive, ~127 bits)
#     k1_new = k1 - a1      (shifted down by ~64 bits)
#
# ALGORITHM (field_declarations.hpp, split_into_endomorphism_scalars):
#
#   1. c1 ≈ (b2·k)/r      via c1 = (endo_g2 · k) >> 256
#   2. c2 ≈ ((-b1)·k)/r   via c2 = (endo_g1 · k) >> 256
#   3. q1 = c1 · (-b1)     (low 256 bits of 512-bit product)
#   4. q2 = c2 · b2        (low 256 bits of 512-bit product)
#   5. t1 = (q2 - q1).reduce_once()                           = k2 (mod r)
#   6. if t1 > 128 bits: t1 = (t1 + endo_minus_b1).reduce_once()  [negative k2 fix]
#   7. t2 = (t1 · λ + k).reduce_once()                        = k1 (mod r)
#   8. Return low 128 bits of (t2, t1) as (k1, k2)
#

def split_scalar(k, modulus, beta, endo_g1, endo_g2, endo_minus_b1, endo_b2):
    """
    Split scalar k into (k1, k2) such that k ≡ k1 - λ·k2 (mod r).

    Implements split_into_endomorphism_scalars() in field_declarations.hpp.

    Returns:
        (k1, k2, t1, t2): The 128-bit split scalars and their full-width forms
    """
    input = k % modulus

    # compute c1 = (g2 * k) >> 256
    c1 = (endo_g2 * input) >> 256
    # compute c2 = (g1 * k) >> 256
    c2 = (endo_g1 * input) >> 256

    # compute q1 = c1 * -b1
    q1_lo = (c1 * endo_minus_b1) % modulus
    # compute q2 = c2 * b2
    q2_lo = (c2 * endo_b2) % modulus

    t1 = (q2_lo - q1_lo) % modulus

    # Negative-k2 fix: k2 (= t1) can be slightly negative for ~2^{-64} of inputs.
    # When negative, t1 = k2 + r is 254 bits (upper limbs nonzero in C++).
    # Adding |b1| shifts along the lattice vector (a1, b1), making k2 positive.
    # In C++: if (t1.data[2] != 0 || t1.data[3] != 0)
    if t1.bit_length() > 128:
        t1 = (t1 + endo_minus_b1) % modulus

    t2 = (t1 * beta + input) % modulus

    # Truncate to 128 bits (as done in C++ implementation)
    k2 = t1 & ((1 << 128) - 1)
    k1 = t2 & ((1 << 128) - 1)

    return k1, k2, t1, t2


# ====================================================================================
# § 6. VERIFICATION
# ====================================================================================
#
# We verify the algorithm on several test cases, including edge cases.

def verify_split(k, k1, k2, t1, t2, lambda_val, modulus):
    """Verify correctness and bounds of the scalar split."""
    reconstructed = (k1 - lambda_val * k2) % modulus
    assert reconstructed == k % modulus, f"k ≡ k1 - λ·k2 failed for k={k}"
    assert t1.bit_length() <= 128, f"t1 has {t1.bit_length()} bits (> 128) for k={k}"
    assert t2.bit_length() <= 128, f"t2 has {t2.bit_length()} bits (> 128) for k={k}"

for k_test in [0, 1, 42, lambda_val, r - 1]:
    k1, k2, t1, t2 = split_scalar(k_test, r, lambda_val, endo_g1, endo_g2, endo_minus_b1, endo_b2)
    verify_split(k_test, k1, k2, t1, t2, lambda_val, r)


# § 6a. Verify the negative-k2 fix on concrete trigger inputs.
#
# These are k = ceil(m * 2^256 / endo_g2) for m = 1, 2, 3 — the smallest k values
# where c1 ticks up to m. Without the fix, t1 would be > 128 bits (negative k2
# wraps around mod r to ~254 bits). The fix brings t1 back within 128 bits.
for m in [1, 2, 3]:
    k_trigger = (m * (1 << 256) + endo_g2 - 1) // endo_g2
    assert k_trigger < r, f"trigger input must be < r for m={m}"

    # Show that the raw (pre-fix) t1 would be > 128 bits for these inputs:
    # compute t1_raw without the fix to demonstrate the problem
    inp = k_trigger % r
    c1_raw = (endo_g2 * inp) >> 256
    c2_raw = (endo_g1 * inp) >> 256
    q1_raw = (c1_raw * endo_minus_b1) % r
    q2_raw = (c2_raw * endo_b2) % r
    t1_raw = (q2_raw - q1_raw) % r
    assert t1_raw.bit_length() > 128, (
        f"Expected raw t1 > 128 bits for m={m}, got {t1_raw.bit_length()} — "
        f"this input should trigger the negative-k2 case"
    )

    # The actual algorithm (with fix) must produce valid 128-bit scalars
    k1, k2, t1, t2 = split_scalar(k_trigger, r, lambda_val, endo_g1, endo_g2, endo_minus_b1, endo_b2)
    verify_split(k_trigger, k1, k2, t1, t2, lambda_val, r)


# ====================================================================================
# § 7. SUMMARY
# ====================================================================================
#
# The GLV endomorphism optimization for BN254:
#
# 1. The BN254 curve has an endomorphism φ(x,y) = (β·x, y) satisfying φ(P) = λ·P
# 2. We can decompose any scalar k as k ≡ k1 - λ·k2 (mod r) with k1, k2 ≈ 127 bits
# 3. The decomposition uses Babai's nearest plane algorithm on a short lattice basis
# 4. Precomputed constants enable division-free computation via fixed-point arithmetic
# 5. The algorithm guarantees both k1 and k2 fit in 128 bits (actually ≤ 127 bits)
# 6. For ~2^{-64} of inputs, k2 is slightly negative; the fix detects this (upper
#    limbs nonzero) and shifts along a lattice vector to make k2 positive
#
# Performance: Instead of one 254-bit scalar multiplication k·P, we compute
# k1·P - k2·φ(P) with two ~127-bit scalars processed via interleaved WNAF,
# reducing the number of doublings by roughly half.
#
# References:
#   • Gallant, Lambert, Vanstone: "Faster Point Multiplication on Elliptic Curves
#     with Efficient Endomorphisms", CRYPTO 2001
#   • https://www.iacr.org/archive/crypto2001/21390189.pdf

if __name__ == "__main__":
    print("BN254 GLV Endomorphism - All verifications passed!")
    print(f"  λ (cube root of unity): {hex(lambda_val)}")
    print(f"  endo_g1: {hex(endo_g1)}")
    print(f"  endo_g2: {hex(endo_g2)}")
    print(f"  endo_minus_b1: {hex(endo_minus_b1)}")
    print(f"  endo_b2: {hex(endo_b2)}")
    print("\nConstants match barretenberg/cpp/src/barretenberg/ecc/curves/bn254/fr.hpp")
