#!/usr/bin/env python3
"""
GLV Endomorphism: Constants and Scalar Splitting for Multiple Curves

This document explains the "splitting scalars" algorithm in Barretenberg for all curves
that admit an efficient endomorphism. We cover:

  Part 0   (§0):     Preliminaries — the GLV lattice and how to find a short basis
  Part I   (§1–§5):  BN254 Fr  — the scalar field of BN254 (254-bit, uses 2^256 shift)
  Part II  (§6–§9):  BN254 Fq  — the base field of BN254 (254-bit, uses 2^256 shift)
  Part III (§10–§14): secp256k1 Fr — the scalar field of secp256k1 (256-bit, uses 2^384 shift)

Reference: Gallant, Lambert, Vanstone, "Faster Point Multiplication on Elliptic Curves" (2001)

NOTATION:
    p   a prime modulus (generic; each Part instantiates it)
    λ   a non-trivial cube root of unity in F_p (λ³ = 1, λ ≠ 1)
    ≈   "approximately equal" — values differ by a small rounding error
"""


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                  PART 0: Preliminaries — The GLV Lattice                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ====================================================================================
# § 0. THE GLV LATTICE AND SHORT BASIS
# ====================================================================================
#
# Let p be a prime and λ ∈ F_p a non-trivial cube root of unity (so λ² + λ + 1 ≡ 0).
# The GLV lattice is:
#
#     L = { (a, b) ∈ Z² : a + λ·b ≡ 0  (mod p) }
#
# Equivalently,
#
# L is a full-rank sublattice of Z² with determinant ±p (since the map
# Z² → Z/pZ, (a,b) ↦ a + λb is surjective, its kernel has index p).
#
# SCALAR SPLITTING.  Given a scalar k, find a lattice point (x, y) close to (k, 0).
# Then k1 = k − x and k2 = y satisfy k ≡ k1 − λ·k2 (mod p), with both k1, k2 small.
# Writing (x, y) = c1·(a1,b1) + c2·(a2,b2) and inverting the 2×2 basis matrix against
# (k, 0) with det = p gives:
#
#     c1 = ⌊k·b2 / p⌋,    c2 = ⌊k·(−b1) / p⌋
#
# Note: only b1 and b2 appear; a1, a2 are not needed for the splitting, which is why
# Barretenberg stores only b1 and b2 in the .hpp parameter files. Any lattice element
# satisfies a ≡ -λ·b (mod p). This relation is verified for every basis we compute,
# and allows us to recover k1 from k2 without needing a1 or a2: since
#  c1·a1 + c2·a2 ≡ -λ·(c1·b1 + c2·b2) ≡ -λ·k2, we get k1 = k + λ·k2.
#
# FINDING A SHORT BASIS.  We run the Euclidean algorithm on (λ, p).  The successive
# remainders r_i satisfy |r_i| ≈ p / (product of quotients), so they shrink from p
# down through √p and below.  We stop at the first remainder r_j < √p and read off
# two short lattice vectors from the Bézout coefficients at steps j−1 and j.
#
# The resulting vector sizes depend on the specific λ and p:
#
#   • BN254 (Fr and Fq): the curve is constructed from a 63-bit parameter x, and the
#     lattice vectors are a1 = b2 = 2x+1 (64 bits), |b1| = 6x²+2x (127 bits).
#     This asymmetric 64/127-bit pattern is a consequence of the BN parametrisation.
#
#   • secp256k1 Fr: no small generating parameter; the lattice vectors are all in the
#     generic ~126–129-bit range (roughly √p for a 256-bit prime).
#

from math import isqrt

def find_short_lattice_basis(lambda_val, modulus):
    """
    Find a short basis for the lattice L = {(a,b) : a + λ·b ≡ 0 (mod p)}.

    Returns (a1, b1, a2, b2) such that:
      - (a1, b1) and (a2, b2) are a basis for L
      - a1 + λ·b1 ≡ 0 (mod p), a2 + λ·b2 ≡ 0 (mod p)
      - det = a1·b2 - a2·b1 = ±p
    """
    # √p is the target vector length.  The lattice L has determinant p, so by
    # Minkowski's theorem its shortest vector has length ≤ √p.  We want both
    # basis vectors near that length so that the GLV subscalars k1, k2 are
    # each ~ √p ≈ 2^{n/2}
    approx_sqrt = isqrt(modulus)

    # Extended Euclidean algorithm on (λ, p).
    #
    # Bézout invariant (maintained at every step):
    #     remainder ≡ coeff · λ  (mod p)
    #
    # This holds initially (remainder = λ, coeff = 1) and is preserved by
    # the update new_remainder = prev_remainder - quot·remainder, new_coeff =
    # prev_coeff - quot·coeff.  It follows that (-remainder, coeff) is always
    # a lattice vector: -remainder + λ·coeff ≡ -coeff·λ + coeff·λ ≡ 0.
    remainder, prev_remainder = lambda_val, modulus
    coeff,     prev_coeff     = 1, 0

    # Run until the remainder first drops below √p.
    while remainder >= approx_sqrt:
        quot                      = prev_remainder // remainder
        prev_remainder, remainder = remainder, prev_remainder - quot * remainder
        prev_coeff,     coeff     = coeff,     prev_coeff     - quot * coeff

    # At this point:
    #   vec_before = (-prev_remainder, prev_coeff)  — last step above √p
    #   vec_cross  = (-remainder,      coeff)        — first step below √p
    vec_before = (-prev_remainder, prev_coeff)
    vec_cross  = (-remainder,      coeff)

    # One more EEA step gives an independent candidate vector.
    quot      = prev_remainder // remainder
    r_after   = prev_remainder - quot * remainder
    s_after   = prev_coeff     - quot * coeff
    vec_after = (-r_after, s_after)

    # First basis vector: vec_cross (shortest, by construction).
    # Second basis vector: shorter of vec_before and vec_after.
    a1, b1 = vec_cross
    a2, b2 = vec_after if (r_after**2 + s_after**2 < prev_remainder**2 + prev_coeff**2) else vec_before

    # Normalise signs so that a1, a2 are positive.
    if a1 < 0 or a1.bit_length() >= 128:
        a1, b1 = -a1, -b1
    if a2 < 0 or a2.bit_length() >= 128:
        a2, b2 = -a2, -b2

    return a1, b1, a2, b2


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║              PART I: BN254 Fr (Scalar Field)                               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ====================================================================================
# § 1. BN254 Fr — FIELD PARAMETERS
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
# § 2. BN254 Fr — LATTICE BASIS
# ====================================================================================
#
# Short basis for the GLV lattice L (see §0).

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

# Note: fr.hpp does NOT store a1 or a2 — only b1 and b2 are needed (see §0).

# ====================================================================================
# § 3. BN254 Fr — PRECOMPUTED CONSTANTS (256-bit shift)
# ====================================================================================
#
# Fixed-point approximations for division-free Babai rounding (see §0):
#
#     endo_g1 = ⌊(-b1) · 2^256 / r⌋
#     endo_g2 = ⌊b2 · 2^256 / r⌋
#
# Then c1 = (endo_g2 · k) >> 256 ≈ k·b2/r and c2 = (endo_g1 · k) >> 256 ≈ k·(-b1)/r,
# each off by at most 1 from the exact rational value.


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
# § 4. BN254 Fr — THE 256-BIT SPLITTING ALGORITHM
# ====================================================================================
#
# Computes (k1, k2) with k ≡ k1 - λ·k2 (mod r) and |k1|, |k2| < 2^128.
# See §0 for the derivation (Babai's nearest plane).
#
# SUBTLETY — k2 CAN BE NEGATIVE:
#
# k2 = -δ1·|b1| + δ2·b2 where δ1, δ2 ∈ [0,1) are rounding errors. This is
# negative when δ1·|b1| > δ2·b2. Since |b1|/b2 ≈ 2^63 for BN254, even tiny
# δ1 can cause this. It happens at k ≈ ⌈m·2^256/endo_g2⌉ where c1 ticks up
# to m. Frequency: ~2^{-64} of all inputs.
#
# FIX: When t1 > 128 bits (i.e. k2 < 0 wrapped mod r), add |b1|. This shifts
# along the lattice vector (a1, b1), making k2 positive:
#     k2_new = k2 + |b1| (positive, ~127 bits),  k1_new = k1 - a1
#
# ALGORITHM (split_into_endomorphism_scalars in field_declarations.hpp):
#
#   1. c1 = (endo_g2 · k) >> 256,  c2 = (endo_g1 · k) >> 256
#   2. t1 = (c2·b2 - c1·(-b1)) mod r                              [= k2]
#   3. if t1 > 128 bits: t1 += endo_minus_b1                      [negative-k2 fix]
#   4. t2 = (t1·λ + k) mod r                                      [= k1]
#   5. Return low 128 bits of (t2, t1)
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
# § 5. BN254 Fr — VERIFICATION
# ====================================================================================

def verify_split(k, k1, k2, t1, t2, lambda_val, modulus):
    """Verify correctness and bounds of the scalar split."""
    reconstructed = (k1 - lambda_val * k2) % modulus
    assert reconstructed == k % modulus, f"k ≡ k1 - λ·k2 failed for k={k}"
    assert t1.bit_length() <= 128, f"t1 has {t1.bit_length()} bits (> 128) for k={k}"
    assert t2.bit_length() <= 128, f"t2 has {t2.bit_length()} bits (> 128) for k={k}"

for k_test in [0, 1, 42, lambda_val, r - 1]:
    k1, k2, t1, t2 = split_scalar(k_test, r, lambda_val, endo_g1, endo_g2, endo_minus_b1, endo_b2)
    verify_split(k_test, k1, k2, t1, t2, lambda_val, r)


# § 5a. Verify the negative-k2 fix on concrete trigger inputs.
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


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                      PART II: BN254 Fq (Base Field)                        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ====================================================================================
# § 6. BN254 Fq — FIELD PARAMETERS AND CUBE ROOT
# ====================================================================================
#
# Fq also has a cube root of unity, so the same GLV technique applies.
# Since Fq is also 254 bits (top limb < 2^62), the 256-bit shift algorithm is used.

# The base field modulus of BN254 (from bn254/fq.hpp)
fq_modulus = 0x30644E72E131A029B85045B68181585D97816A916871CA8D3C208C16D87CFD47

# Montgomery parameter for Fq: R = 2^256 mod q
fq_R = pow(2, 256, fq_modulus)
fq_R_inv = pow(fq_R, -1, fq_modulus)

# The cube root of unity β ∈ Fq (from bn254/fq.hpp), stored in Montgomery form
fq_cube_root_montgomery = (
    0x71930c11d782e155 |
    (0xa6bb947cffbe3323 << 64) |
    (0xaa303344d4741444 << 128) |
    (0x2c3b3f0d26594943 << 192)
)

# Convert from Montgomery form to standard form
fq_beta = (fq_cube_root_montgomery * fq_R_inv) % fq_modulus

# Verify that β is a non-trivial cube root of unity in Fq
assert (pow(fq_beta, 2, fq_modulus) + fq_beta + 1) % fq_modulus == 0, "β² + β + 1 ≡ 0 (mod q)"
assert fq_beta != 1, "β must be non-trivial"


# ====================================================================================
# § 7. BN254 Fq — LATTICE BASIS
# ====================================================================================
#
# Derive the short lattice basis for Fq using find_short_lattice_basis (§0).

fq_a1, fq_b1, fq_a2, fq_b2 = find_short_lattice_basis(fq_beta, fq_modulus)

# Verify lattice membership
assert (fq_a1 + fq_beta * fq_b1) % fq_modulus == 0, "Fq lattice vector 1"
assert (fq_a2 + fq_beta * fq_b2) % fq_modulus == 0, "Fq lattice vector 2"

# Verify determinant
fq_det = fq_a1 * fq_b2 - fq_a2 * fq_b1
assert abs(fq_det) == fq_modulus, f"Fq lattice determinant must be ±q, got {fq_det}"


# ====================================================================================
# § 8. BN254 Fq — PRECOMPUTED CONSTANTS AND VERIFICATION
# ====================================================================================

fq_endo_g1, fq_endo_g2, fq_endo_minus_b1, fq_endo_b2 = compute_splitting_constants(
    fq_modulus, fq_b1, fq_b2
)

# Verify these match the values in bn254/fq.hpp
fq_expected_endo_g1 = 0x7a7bd9d4391eb18d | (0x4ccef014a773d2cf << 64) | (0x2 << 128)
fq_expected_endo_g2 = 0xd91d232ec7e0b3d2 | (0x2 << 64)
fq_expected_endo_minus_b1 = 0x8211bbeb7d4f1129 | (0x6f4d8248eeb859fc << 64)
fq_expected_endo_b2 = 0x89d3256894d213e2

assert fq_endo_g1 == fq_expected_endo_g1, (
    f"Fq endo_g1 mismatch: got {hex(fq_endo_g1)}, expected {hex(fq_expected_endo_g1)}"
)
assert fq_endo_g2 == fq_expected_endo_g2, (
    f"Fq endo_g2 mismatch: got {hex(fq_endo_g2)}, expected {hex(fq_expected_endo_g2)}"
)
assert fq_endo_minus_b1 == fq_expected_endo_minus_b1, (
    f"Fq endo_minus_b1 mismatch: got {hex(fq_endo_minus_b1)}, expected {hex(fq_expected_endo_minus_b1)}"
)
assert fq_endo_b2 == fq_expected_endo_b2, (
    f"Fq endo_b2 mismatch: got {hex(fq_endo_b2)}, expected {hex(fq_expected_endo_b2)}"
)


# ====================================================================================
# § 9. BN254 Fq — SPLITTING VERIFICATION
# ====================================================================================

for k_test in [0, 1, 42, fq_beta, fq_modulus - 1]:
    k1, k2, t1, t2 = split_scalar(
        k_test, fq_modulus, fq_beta, fq_endo_g1, fq_endo_g2, fq_endo_minus_b1, fq_endo_b2
    )
    verify_split(k_test, k1, k2, t1, t2, fq_beta, fq_modulus)

# Verify negative-k2 triggers for Fq
for m in [1, 2, 3]:
    k_trigger = (m * (1 << 256) + fq_endo_g2 - 1) // fq_endo_g2
    if k_trigger < fq_modulus:
        k1, k2, t1, t2 = split_scalar(
            k_trigger, fq_modulus, fq_beta, fq_endo_g1, fq_endo_g2, fq_endo_minus_b1, fq_endo_b2
        )
        verify_split(k_trigger, k1, k2, t1, t2, fq_beta, fq_modulus)


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║               PART III: secp256k1 Fr (Scalar Field)                        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ====================================================================================
# § 10. secp256k1 Fr — FIELD PARAMETERS
# ====================================================================================
#
# secp256k1's scalar field modulus is a full 256 bits (top limb = 0xFFFF...),
# exceeding MODULUS_TOP_LIMB_LARGE_THRESHOLD (2^62). AUDITTODO: explain *exactly* the rounding issues that force this.
# This requires:
#   - 2^384 shift instead of 2^256 (a >>256 shift loses precision for 256-bit moduli)
#   - 4-limb endo_g constants (lo/mid/hi/hihi)
#   - Montgomery field multiplication in split_into_endomorphism_scalars_384

# The scalar field modulus of secp256k1 (from secp256k1.hpp, FrParams)
secp_r = (
    0xBFD25E8CD0364141 |
    (0xBAAEDCE6AF48A03B << 64) |
    (0xFFFFFFFFFFFFFFFE << 128) |
    (0xFFFFFFFFFFFFFFFF << 192)
)

# Montgomery parameter for secp256k1 Fr: R = 2^256 mod r
secp_R = pow(2, 256, secp_r)
secp_R_inv = pow(secp_R, -1, secp_r)

# The cube root of unity λ ∈ secp256k1::Fr (from secp256k1.hpp FrParams), in Montgomery form
secp_cube_root_montgomery = (
    0xf07deb3dc9926c9e |
    (0x2c93e7ad83c6944c << 64) |
    (0x73a9660652697d91 << 128) |
    (0x532840178558d639 << 192)
)

# Convert from Montgomery form to standard form
secp_lambda = (secp_cube_root_montgomery * secp_R_inv) % secp_r

# Verify that λ is a non-trivial cube root of unity in secp256k1 Fr
assert (pow(secp_lambda, 2, secp_r) + secp_lambda + 1) % secp_r == 0, "λ² + λ + 1 ≡ 0 (mod r)"


# ====================================================================================
# § 11. secp256k1 Fr — LATTICE BASIS
# ====================================================================================
#
# See §0 for why these vectors are ~126–129 bits (unlike BN254's 64/127 pattern).

secp_a1, secp_b1, secp_a2, secp_b2 = find_short_lattice_basis(secp_lambda, secp_r)

# Verify lattice membership
assert (secp_a1 + secp_lambda * secp_b1) % secp_r == 0, "secp256k1 lattice vector 1"
assert (secp_a2 + secp_lambda * secp_b2) % secp_r == 0, "secp256k1 lattice vector 2"

# Verify determinant
secp_det = secp_a1 * secp_b2 - secp_a2 * secp_b1
assert abs(secp_det) == secp_r, "secp256k1 lattice determinant must be ±r"


# ====================================================================================
# § 12. secp256k1 Fr — PRECOMPUTED CONSTANTS (384-bit shift)
# ====================================================================================
#
# In the 384-bit code, the naming is "cross-paired" — g1 is paired with minus_b1,
# and g2 is paired with b2 (the opposite of what you might expect):
#
#     endo_g1 = ⌈b2 · 2^384 / r⌉
#     endo_g2 = ⌊(-b1) · 2^384 / r⌋
#
# Note: secp256k1_endo_notes.hpp uses the opposite naming convention for g1/g2,
# but the STORED values in FrParams follow this cross-paired convention.

def compute_splitting_constants_384(modulus, b1, b2):
    """
    Compute the precomputed constants for the 384-bit shift variant.

    Returns (endo_g1, endo_g2, endo_minus_b1, endo_b2) matching the hpp file.

    Convention: endo_g1 is the b2-based approximation (cross-paired with minus_b1),
                endo_g2 is the (-b1)-based approximation (cross-paired with b2).
    """
    shift = 1 << 384
    # endo_g1 = ceil(b2 * 2^384 / r)  — cross-paired with minus_b1 in the algorithm
    endo_g1 = -((-b2 * shift) // modulus)
    # endo_g2 = floor((-b1) * 2^384 / r) — cross-paired with b2 in the algorithm
    endo_g2 = ((-b1) * shift) // modulus
    endo_minus_b1 = (-b1) % modulus
    endo_b2 = b2 % modulus
    return endo_g1, endo_g2, endo_minus_b1, endo_b2


secp_endo_g1, secp_endo_g2, secp_endo_minus_b1, secp_endo_b2 = compute_splitting_constants_384(
    secp_r, secp_b1, secp_b2
)

# Verify these match the values in secp256k1.hpp (FrParams)
# endo_g1 is stored as (lo, mid, hi, hihi) — 4 × 64-bit limbs
secp_expected_endo_g1 = (
    0xE893209A45DBB031 |
    (0x3DAA8A1471E8CA7F << 64) |
    (0xE86C90E49284EB15 << 128) |
    (0x3086D221A7D46BCD << 192)
)
secp_expected_endo_g2 = (
    0x1571B4AE8AC47F71 |
    (0x221208AC9DF506C6 << 64) |
    (0x6F547FA90ABFE4C4 << 128) |
    (0xE4437ED6010E8828 << 192)
)
secp_expected_endo_minus_b1 = 0x6F547FA90ABFE4C3 | (0xE4437ED6010E8828 << 64)
secp_expected_endo_b2 = 0xe86c90e49284eb15 | (0x3086d221a7d46bcd << 64)

assert secp_endo_g1 == secp_expected_endo_g1, (
    f"secp256k1 endo_g1 mismatch:\n  got      {hex(secp_endo_g1)}\n  expected {hex(secp_expected_endo_g1)}"
)
assert secp_endo_g2 == secp_expected_endo_g2, (
    f"secp256k1 endo_g2 mismatch:\n  got      {hex(secp_endo_g2)}\n  expected {hex(secp_expected_endo_g2)}"
)
assert secp_endo_minus_b1 == secp_expected_endo_minus_b1, (
    f"secp256k1 endo_minus_b1 mismatch:\n  got      {hex(secp_endo_minus_b1)}\n  expected {hex(secp_expected_endo_minus_b1)}"
)
assert secp_endo_b2 == secp_expected_endo_b2, (
    f"secp256k1 endo_b2 mismatch:\n  got      {hex(secp_endo_b2)}\n  expected {hex(secp_expected_endo_b2)}"
)


# ====================================================================================
# § 13. secp256k1 Fr — THE 384-BIT SPLITTING ALGORITHM
# ====================================================================================
#
# Unlike the 256-bit variant, there is no explicit negative-k2 fix — field
# subtraction handles signs. The c1, c2 values are converted to Montgomery form
# and multiplied via field ops (which reduce mod r automatically).
#
# ALGORITHM (split_into_endomorphism_scalars_384 in field_declarations.hpp):
#
#   1. c1 = (endo_g1 · k) >> 384,  c2 = (endo_g2 · k) >> 384
#   2. r2f = c1·(-b1) - c2·b2      (cross-products, computed as field elements)
#   3. r1f = k - r2f·λ
#   4. k1 = r1f, k2 = -r2f

def split_scalar_384(k, modulus, lambda_val, endo_g1, endo_g2, endo_minus_b1, endo_b2):
    """
    Split scalar k using the 384-bit shift variant.

    Implements split_into_endomorphism_scalars_384() in field_declarations.hpp.

    Returns:
        (k1, k2): The split scalars such that k ≡ k1 - λ·k2 (mod r)
    """
    input_val = k % modulus

    # c1 ≈ k·b2/r,  c2 ≈ k·(-b1)/r
    c1 = (endo_g1 * input_val) >> 384
    c2 = (endo_g2 * input_val) >> 384

    # Cross-products (computed as field elements in C++ via Montgomery)
    c1_times_minus_b1 = (c1 * endo_minus_b1) % modulus
    c2_times_b2 = (c2 * endo_b2) % modulus

    # r2f = c1·(-b1) - c2·b2 (nearly cancels, leaving small lattice error)
    r2f = (c1_times_minus_b1 - c2_times_b2) % modulus

    # r1f = k - r2f·λ
    r1f = (input_val - r2f * lambda_val) % modulus

    # k1 = r1f, k2 = -r2f;  invariant: k ≡ k1 - λ·k2 (mod r)
    k1 = r1f
    k2 = (-r2f) % modulus

    return k1, k2


# ====================================================================================
# § 14. secp256k1 Fr — SPLITTING VERIFICATION
# ====================================================================================

def verify_split_384(k, k1, k2, lambda_val, modulus):
    """Verify correctness of the 384-bit scalar split."""
    # The invariant is k ≡ k1 - λ·k2 (mod r)
    reconstructed = (k1 - lambda_val * k2) % modulus
    assert reconstructed == k % modulus, (
        f"k ≡ k1 - λ·k2 failed for k={hex(k)}\n"
        f"  k1={hex(k1)}, k2={hex(k2)}\n"
        f"  reconstructed={hex(reconstructed)}, expected={hex(k % modulus)}"
    )
    # For the 384-bit variant, k1 and k2 are field elements; they should be small
    # enough that the decomposition is useful. We verify they fit in ~129 bits.
    # (The C++ code does not explicitly truncate to 128 bits in this path;
    # the values may be slightly larger than in the 256-bit path.)
    k1_eff = k1 if k1 <= modulus // 2 else modulus - k1
    k2_eff = k2 if k2 <= modulus // 2 else modulus - k2
    assert k1_eff.bit_length() <= 129, (
        f"k1 effective magnitude has {k1_eff.bit_length()} bits (> 129) for k={hex(k)}"
    )
    assert k2_eff.bit_length() <= 129, (
        f"k2 effective magnitude has {k2_eff.bit_length()} bits (> 129) for k={hex(k)}"
    )


for k_test in [0, 1, 42, secp_lambda, secp_r - 1, secp_r // 2, secp_r // 3]:
    k1, k2 = split_scalar_384(
        k_test, secp_r, secp_lambda, secp_endo_g1, secp_endo_g2, secp_endo_minus_b1, secp_endo_b2
    )
    verify_split_384(k_test, k1, k2, secp_lambda, secp_r)


# Also verify with the cube root of unity in the BASE field (secp256k1 Fq).
# The base field Fq of secp256k1 has modulus p = 2^256 - 2^32 - 977, which also
# has a cube root of unity β. This β is what gets multiplied with the x-coordinate
# in the endomorphism φ(x,y) = (β·x, y). Let's verify it.

secp_fq_modulus = (
    0xFFFFFFFEFFFFFC2F |
    (0xFFFFFFFFFFFFFFFF << 64) |
    (0xFFFFFFFFFFFFFFFF << 128) |
    (0xFFFFFFFFFFFFFFFF << 192)
)

secp_fq_R = pow(2, 256, secp_fq_modulus)
secp_fq_R_inv = pow(secp_fq_R, -1, secp_fq_modulus)

secp_fq_cube_root_montgomery = (
    0x58a4361c8e81894e |
    (0x03fde1631c4b80af << 64) |
    (0xf8e98978d02e3905 << 128) |
    (0x7a4a36aebcbb3d53 << 192)
)

secp_fq_beta = (secp_fq_cube_root_montgomery * secp_fq_R_inv) % secp_fq_modulus
assert pow(secp_fq_beta, 3, secp_fq_modulus) == 1, "β³ ≡ 1 (mod p) for secp256k1 Fq"
assert secp_fq_beta != 1, "β must be non-trivial"


# ====================================================================================
# § 15. SUMMARY
# ====================================================================================
#
# Derived and verified GLV endomorphism constants for:
#   - BN254 Fr     (§1–§5):   254-bit, 256-bit shift, constants match bn254/fr.hpp
#   - BN254 Fq     (§6–§9):   254-bit, 256-bit shift, constants match bn254/fq.hpp
#   - secp256k1 Fr  (§10–§14): 256-bit, 384-bit shift, constants match secp256k1.hpp
#   - secp256k1 Fq cube root β also verified (end of Part III)
#
# Architectural split: MODULUS_TOP_LIMB_LARGE_THRESHOLD (2^62) determines whether
# split_into_endomorphism_scalars (256-bit) or _384 (384-bit) is used.

if __name__ == "__main__":
    print("=== Part I: BN254 Fr ===")
    print(f"  λ (cube root): {hex(lambda_val)}")
    print(f"  endo_g1:       {hex(endo_g1)}")
    print(f"  endo_g2:       {hex(endo_g2)}")
    print(f"  endo_minus_b1: {hex(endo_minus_b1)}")
    print(f"  endo_b2:       {hex(endo_b2)}")
    print("  -> Constants match bn254/fr.hpp")

    print("\n=== Part II: BN254 Fq ===")
    print(f"  β (cube root): {hex(fq_beta)}")
    print(f"  endo_g1:       {hex(fq_endo_g1)}")
    print(f"  endo_g2:       {hex(fq_endo_g2)}")
    print(f"  endo_minus_b1: {hex(fq_endo_minus_b1)}")
    print(f"  endo_b2:       {hex(fq_endo_b2)}")
    print("  -> Constants match bn254/fq.hpp")

    print("\n=== Part III: secp256k1 Fr ===")
    print(f"  λ (cube root): {hex(secp_lambda)}")
    print(f"  endo_g1:       {hex(secp_endo_g1)}")
    print(f"  endo_g2:       {hex(secp_endo_g2)}")
    print(f"  endo_minus_b1: {hex(secp_endo_minus_b1)}")
    print(f"  endo_b2:       {hex(secp_endo_b2)}")
    print("  -> Constants match secp256k1.hpp FrParams")

    print("\n=== secp256k1 Fq (base field) ===")
    print(f"  β (cube root): {hex(secp_fq_beta)}")
    print("  -> Cube root verified")

    print("\nAll verifications passed!")
