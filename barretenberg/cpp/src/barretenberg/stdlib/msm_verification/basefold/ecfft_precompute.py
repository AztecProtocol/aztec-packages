#!/usr/bin/env python3
"""
ECFFT Domain Precomputation for BaseFold
=========================================

This script builds the "ECFFT domain" — a chain of evaluation domains connected by
2-to-1 rational maps — and exports the precomputed data that the C++ BaseFold verifier
needs.

Background: why ECFFT?
-----------------------

Standard FRI needs a field with large 2-adic roots of unity so it can build domains
{ω^i} and fold by pairing ω^i ↔ −ω^i.  BN254's base field Fq (= Grumpkin's scalar
field) has 2-adicity only 1: there is no ω with ω^{2^k} = 1 for useful k.

ECFFT (Ben-Sasson, Carmon, Kopparty, Levit 2022, "ECFFT Part II", Appendix B.2)
replaces multiplicative-group structure with *isogeny* structure on elliptic curves.
A "good isogeny" ψ: E → E' is a 2-to-1 rational map on x-coordinates, so if we
start with a set L₀ of 2^k x-coordinates on E, we get a shrinking chain:

    L₀  →ψ₀→  L₁  →ψ₁→  L₂  → ⋯ →  L_k      (|Lᵢ| = 2^{k−i})

Each ψᵢ maps exactly two points in Lᵢ to one point in Lᵢ₊₁. This gives us the
binary-tree pairing structure that FRI needs.

The FRI fold formula
--------------------

For the "good" isogeny family used here, the denominator function is v(x) = x.
Given round i with domain Lᵢ, degree bound d, and verifier challenge z:

  For each pair (s₀, s₁) = (Lᵢ[j], Lᵢ[j + m/2]):

      e = d/2 − 1                        (degree-aware normalization exponent)
      a = f(s₀) / s₀ᵉ                   (normalize by v(s₀)ᵉ)
      b = f(s₁) / s₁ᵉ
      fold_z(f)(ψ(s₀)) = a + (b − a)/(s₁ − s₀) · (z − s₀)

This is *pointwise*: each output depends on exactly 2 inputs, so the verifier can
check a single query in O(1) rather than running a full ECFFT decomposition.

Pairing convention
------------------

Points are paired by *first-half / second-half*, NOT even/odd:

    pair j  =  (Lᵢ[j],  Lᵢ[j + m/2])       for j ∈ {0, …, m/2 − 1}

This is set up during domain construction and verified with assertions.

Usage
-----

    # Generate a C++ header with domain data for log₂(n) = 8:
    python3 ecfft_precompute.py --log-n 8 --output-hpp domain_data.hpp

    # Generate test vectors to validate the C++ implementation:
    python3 ecfft_precompute.py --log-n 8 --output-test test_vectors.json
"""

import sys
import os
import argparse
import json

# ============================================================================
# Field arithmetic over BN254's base field Fq
# ============================================================================
#
# Fq = GF(21888242871839275222246405745257275088696311157297823662689037894645226208583)
#
# This is the base field of BN254, which is also the scalar field of the Grumpkin
# curve.  All domain points live in this field.

q = 21888242871839275222246405745257275088696311157297823662689037894645226208583

def fadd(a, b): return (a + b) % q
def fsub(a, b): return (a - b) % q
def fmul(a, b): return (a * b) % q
def fneg(a):    return (-a) % q
def finv(a):    return pow(a, q - 2, q)       # Fermat's little theorem
def fpow(a, n): return pow(a, n, q)
def fdiv(a, b): return fmul(a, finv(b))


def batch_inv(vals):
    """Invert a list of field elements using Montgomery's trick.

    Instead of n independent inversions (each requiring an exponentiation),
    this computes all n inverses with a single inversion plus 3(n−1)
    multiplications by building a prefix-product tree:

        prefix[i] = vals[0] · vals[1] · ⋯ · vals[i]

    Then invert only prefix[n−1], and unwind to recover each inverse.
    """
    n = len(vals)
    if n == 0:
        return []
    prefix = [0] * n
    prefix[0] = vals[0]
    for i in range(1, n):
        prefix[i] = fmul(prefix[i - 1], vals[i])
    inv_all = finv(prefix[-1])              # the single expensive inversion
    result = [0] * n
    for i in range(n - 1, 0, -1):
        result[i] = fmul(inv_all, prefix[i - 1])
        inv_all = fmul(inv_all, vals[i])
    result[0] = inv_all
    return result


def poly_eval(coeffs, x):
    """Evaluate polynomial c₀ + c₁·x + c₂·x² + ⋯ at x (Horner would be faster
    but this is only used for small test polynomials, so clarity wins)."""
    result = 0
    xpow = 1
    for c in coeffs:
        result = fadd(result, fmul(c, xpow))
        xpow = fmul(xpow, x)
    return result


# ============================================================================
# Elliptic curve arithmetic (Good curves: y² = x³ + ax² + Bx)
# ============================================================================
#
# A "good curve" (in the ECFFT sense) is one of the form y² = x³ + ax² + Bx.
# The key property is that the map ψ(x) = (x − √B)² / x is a 2-to-1 rational
# map on x-coordinates that sends points on this curve to points on another
# good curve — an *isogeny*.  Iterating this gives the chain of domains.
#
# We store B (called `bb`) and its square root b = √B.  The square root exists
# because we only use curves where B is a quadratic residue mod q.

class GoodCurve:
    """A 'good curve' y² = x³ + ax² + Bx over Fq."""

    def __init__(self, a, bb):
        self.a = a % q          # coefficient of x²
        self.bb = bb % q        # coefficient of x  (called B in the literature)
        self.b = fpow(bb, (q + 1) // 4)   # √B  (works because q ≡ 3 mod 4)
        assert fmul(self.b, self.b) == self.bb, "B is not a quadratic residue"


class Point:
    """A point on a GoodCurve, in affine coordinates (or the point at infinity)."""

    def __init__(self, x, y, curve, inf=False):
        self.x = x % q
        self.y = y % q
        self.curve = curve
        self.inf = inf

    @staticmethod
    def infinity(curve=None):
        return Point(0, 0, curve, inf=True)

    def __eq__(self, other):
        if self.inf and other.inf:
            return True
        if self.inf or other.inf:
            return False
        return self.x == other.x and self.y == other.y

    def __neg__(self):
        if self.inf:
            return self
        return Point(self.x, fneg(self.y), self.curve)

    def double(self):
        """Point doubling on y² = x³ + ax² + Bx.

        The tangent slope is λ = (3x² + 2ax + B) / (2y), then:
            x₃ = λ² − a − 2x
            y₃ = λ(x − x₃) − y
        """
        if self.inf or self.y == 0:
            return Point.infinity(self.curve)
        a = self.curve.a
        num = fadd(fadd(fmul(3, fmul(self.x, self.x)),
                        fmul(2, fmul(a, self.x))),
                   self.curve.bb)
        den = fmul(2, self.y)
        lam = fdiv(num, den)
        x3 = fsub(fsub(fmul(lam, lam), a), fmul(2, self.x))
        y3 = fsub(fmul(lam, fsub(self.x, x3)), self.y)
        return Point(x3, y3, self.curve)

    def __add__(self, other):
        """Point addition (handles all cases: infinity, doubling, general)."""
        if self.inf:
            return other
        if other.inf:
            return self
        if self.x == other.x:
            if self.y == other.y:
                return self.double()
            return Point.infinity(self.curve)  # P + (−P) = O
        lam = fdiv(fsub(other.y, self.y), fsub(other.x, self.x))
        x3 = fsub(fsub(fmul(lam, lam), self.curve.a), fadd(self.x, other.x))
        y3 = fsub(fmul(lam, fsub(self.x, x3)), self.y)
        return Point(x3, y3, self.curve)

    def scalar_mul(self, n):
        """Double-and-add scalar multiplication.  The group order is q+1 for
        these curves (they are supersingular-like with #E(Fq) dividing q+1)."""
        n = n % (q + 1)
        result = Point.infinity(self.curve)
        base = self
        while n > 0:
            if n & 1:
                result = result + base
            base = base.double()
            n >>= 1
        return result


# ============================================================================
# Good isogenies
# ============================================================================
#
# For a good curve y² = x³ + ax² + Bx with b = √B, the "good isogeny" is:
#
#     ψ(x) = (x − b)² / x          (rational map on x-coordinates, 2-to-1)
#     h(x) = (x² − B) / x²         (y-coordinate adjustment: y ↦ y · h(x))
#
# The codomain is another good curve with parameters:
#     a' = a + 6b
#     B' = 4ab + 8b²
#
# The denominator function for this isogeny is v(x) = x.  This is the function
# that appears in the FRI fold normalization: we divide by v(s)^e = s^e.

class RationalMap:
    """A rational function p(x)/q(x) represented by coefficient lists."""

    def __init__(self, num, den):
        self.num = [c % q for c in num]
        self.den = [c % q for c in den]

    def __call__(self, x):
        x = x % q
        n = poly_eval(self.num, x)
        d = poly_eval(self.den, x)
        if d == 0:
            return None
        return fdiv(n, d)


def good_isogeny(curve):
    """Compute the good isogeny for `curve` and return (ψ, h, codomain).

    ψ(x) = (x − b)² / x  =  (B − 2bx + x²) / x
    h(x) = (x² − B) / x²
    """
    a, b, bb = curve.a, curve.b, curve.bb
    psi = RationalMap([bb, fneg(fmul(2, b)), 1],   # numerator:   B − 2bx + x²
                      [0, 1])                       # denominator: x
    h = RationalMap([fneg(bb), 0, 1],               # numerator:   −B + x²
                    [0, 0, 1])                      # denominator: x²
    codomain = GoodCurve(fadd(a, fmul(6, b)),
                         fadd(fmul(4, fmul(a, b)), fmul(8, fmul(b, b))))
    return psi, h, codomain


def apply_isogeny(psi, h, codomain, point):
    """Push a point through an isogeny: (x, y) ↦ (ψ(x), y · h(x))."""
    if point.inf:
        return Point.infinity(codomain)
    new_x = psi(point.x)
    if new_x is None:
        return Point.infinity(codomain)
    new_y = fmul(point.y, h(point.x))
    return Point(new_x, new_y, codomain)


def build_isogeny_chain(gen, k):
    """Build a chain of k good isogenies starting from `gen`, a point of order 2^k.

    Returns (psis, curves, hs) where:
      - psis[i]   is the rational map ψᵢ: Lᵢ → Lᵢ₊₁
      - curves[i] is the curve for layer i  (length k+1)
      - hs[i]     is the y-adjustment map for isogeny i
    """
    psis, hs, curves = [], [], [gen.curve]
    g = gen
    for _ in range(k):
        r, h, cod = good_isogeny(g.curve)
        psis.append(r)
        hs.append(h)
        curves.append(cod)
        g = apply_isogeny(r, h, cod, g)
    return psis, curves, hs


# ============================================================================
# ECFFT Domain — the layered evaluation domain
# ============================================================================
#
# An EcfftDomain holds k+1 layers L₀, L₁, …, L_k where:
#   - L₀ has n = 2^k x-coordinates (the initial evaluation domain)
#   - Lᵢ₊₁ = ψᵢ(Lᵢ) has |Lᵢ|/2 points
#   - Pairing: (Lᵢ[j], Lᵢ[j + m/2]) maps to Lᵢ₊₁[j]
#
# For the FRI verifier, the key precomputed datum per pair is:
#
#     pair_diff_inv[i][j] = 1 / (Lᵢ[j + m/2] − Lᵢ[j])
#
# This is the only thing beyond the domain points themselves that the verifier
# needs.  The normalization s^e depends on the degree bound and is computed at
# fold time.

class EcfftDomain:
    def __init__(self, params, log_n):
        assert log_n <= params['k']
        n = 1 << log_n
        self.log_n = log_n
        self.n = n

        # Set up the base curve and generator
        curve = GoodCurve(params['a'], params['bb'])
        gen = Point(params['gx'], params['gy'], curve)

        # Scale the generator so it has order exactly 2^log_n.
        # The raw generator has order 2^k; multiplying by 2^{k − log_n} gives
        # a point of order 2^log_n.
        scaled_gen = gen.scalar_mul(1 << (params['k'] - log_n))

        # Build the isogeny chain: k rational maps and k+1 curves
        self.psis, self.curves, self.hs = build_isogeny_chain(scaled_gen, log_n)

        # Build L₀: x-coordinates of the coset {2G + i·scaled_gen | i = 0,…,n−1}.
        # Using 2G (rather than G itself) avoids the point at infinity appearing
        # in the domain (since scaled_gen has order 2^log_n, the coset offset
        # ensures no cancellation).
        coset = gen.double()
        L0 = []
        acc = Point.infinity(curve)
        for _ in range(n):
            pt = coset + acc
            L0.append(pt.x)
            acc = acc + scaled_gen

        # Build remaining layers by applying ψᵢ to each layer
        self.layers = [L0]
        current = L0
        for i in range(log_n):
            psi = self.psis[i]
            half = len(current) // 2
            next_layer = [psi(current[j]) for j in range(half)]
            # Verify the 2-to-1 pairing: ψ(first half) == ψ(second half)
            for j in range(half):
                assert next_layer[j] == psi(current[j + half]), \
                    f"ψ pairing broken at layer {i}, index {j}"
            self.layers.append(next_layer)
            current = next_layer

        # Precompute 1/(s₁ − s₀) for every pair in every layer
        self._precompute_twiddles()

    def _precompute_twiddles(self):
        """For each layer i and pair j, compute 1/(Lᵢ[j + m/2] − Lᵢ[j]).

        These are the only per-pair constants the verifier needs (beyond the
        domain points).  We batch-invert for efficiency.
        """
        self.pair_diff_inv = []
        for i in range(self.log_n):
            layer = self.layers[i]
            half = len(layer) // 2
            diffs = [fsub(layer[j + half], layer[j]) for j in range(half)]
            self.pair_diff_inv.append(batch_inv(diffs))

    def num_rounds(self):
        return self.log_n

    def layer(self, i):
        return self.layers[i]

    def layer_size(self, i):
        return len(self.layers[i])

    def pair_at(self, round_idx, j):
        """Return (s₀, s₁) for pair j at the given round."""
        layer = self.layers[round_idx]
        half = len(layer) // 2
        return layer[j], layer[j + half]


# ============================================================================
# ECFFT FRI fold — the "pointwise hash" from BSCKL22 Appendix B.2
# ============================================================================

def ecfri_fold_step(word, domain, round_idx, degree_bound, z):
    """One round of the ECFFT FRI fold.

    Given evaluations `word` on domain layer `round_idx` (size m), fold them
    using challenge z and the stated degree_bound:

        For each pair j:
            s₀, s₁ = Lᵢ[j], Lᵢ[j + m/2]
            e = degree_bound/2 − 1
            a = word[j]       / s₀ᵉ       (normalize)
            b = word[j + m/2] / s₁ᵉ
            out[j] = a + (b − a)/(s₁ − s₀) · (z − s₀)

    Returns m/2 values: the evaluations on the next layer.
    """
    layer = domain.layer(round_idx)
    m = len(layer)
    assert len(word) == m
    assert degree_bound % 2 == 0
    assert degree_bound <= m
    half = m // 2
    e = degree_bound // 2 - 1

    diff_inv = domain.pair_diff_inv[round_idx]
    out = [0] * half

    for j in range(half):
        s0 = layer[j]
        s1 = layer[j + half]

        # Normalize by v(s)ᵉ = sᵉ.  When e = 0, normalization is trivial.
        if e == 0:
            a = word[j]
            b = word[j + half]
        else:
            a = fdiv(word[j], fpow(s0, e))
            b = fdiv(word[j + half], fpow(s1, e))

        # Interpolate the line through (s₀, a) and (s₁, b), evaluate at z
        slope = fmul(fsub(b, a), diff_inv[j])
        out[j] = fadd(a, fmul(slope, fsub(z, s0)))

    return out


def ecfri_fold(word, domain, degree_bound, challenges):
    """Multi-round fold: apply ecfri_fold_step for each challenge in sequence,
    halving the degree bound each round."""
    current = list(word)
    d = degree_bound
    for i, z in enumerate(challenges):
        current = ecfri_fold_step(current, domain, i, d, z)
        d //= 2
    return current


def ecfri_verify_query(domain, round_idx, degree_bound, j, f_s0, f_s1, z):
    """Verifier-side fold for a single query.

    Given the openings f(s₀) and f(s₁) at pair index j, compute the expected
    fold value at Lᵢ₊₁[j].  This is exactly the same formula as ecfri_fold_step
    but for a single pair.
    """
    layer = domain.layer(round_idx)
    half = len(layer) // 2
    e = degree_bound // 2 - 1

    s0 = layer[j]
    s1 = layer[j + half]
    diff_inv = domain.pair_diff_inv[round_idx][j]

    if e == 0:
        a, b = f_s0, f_s1
    else:
        a = fdiv(f_s0, fpow(s0, e))
        b = fdiv(f_s1, fpow(s1, e))

    slope = fmul(fsub(b, a), diff_inv)
    return fadd(a, fmul(slope, fsub(z, s0)))


# ============================================================================
# Lagrange interpolation (used only by test vector generation)
# ============================================================================

def lagrange_interp_coeffs(xs, ys):
    """Recover polynomial coefficients from point evaluations.

    Given (x₀,y₀), …, (x_{n−1}, y_{n−1}), returns [c₀, c₁, …, c_{n−1}] such
    that c₀ + c₁·x + ⋯ = yᵢ at each xᵢ.  O(n²) — fine for small test sizes.
    """
    n = len(xs)
    assert len(ys) == n
    coeffs = [0] * n
    for i in range(n):
        # Build Lagrange basis Lᵢ(x) = ∏_{j≠i} (x − xⱼ) / (xᵢ − xⱼ)
        basis = [1]
        denom = 1
        for j in range(n):
            if j == i:
                continue
            denom = fmul(denom, fsub(xs[i], xs[j]))
            new_basis = [0] * (len(basis) + 1)
            for k in range(len(basis)):
                new_basis[k] = fadd(new_basis[k], fmul(basis[k], fneg(xs[j])))
                new_basis[k + 1] = fadd(new_basis[k + 1], basis[k])
            basis = new_basis
        denom_inv = finv(denom)
        for k in range(len(basis)):
            coeffs[k] = fadd(coeffs[k], fmul(ys[i], fmul(basis[k], denom_inv)))
    return coeffs


def poly_degree(coeffs):
    """Degree of a polynomial (index of highest nonzero coefficient, or −1)."""
    for i in range(len(coeffs) - 1, -1, -1):
        if coeffs[i] % q != 0:
            return i
    return -1


# ============================================================================
# Export: C++ header
# ============================================================================

def field_to_hex(val):
    """Field element → 0x-prefixed 64-char big-endian hex string."""
    return "0x" + format(val % q, '064x')


def export_verifier_data_hpp(domain, outfile):
    """Write a C++ header containing all domain points and pair-diff inverses.

    For each layer i (size m), emits:
      - LAYER_i:          m field elements  (the x-coordinates Lᵢ[0..m))
      - PAIR_DIFF_INV_i:  m/2 field elements (1/(s₁ − s₀) for each pair)
    """
    log_n = domain.log_n
    n = domain.n

    with open(outfile, 'w') as f:
        f.write("#pragma once\n")
        f.write("// AUTO-GENERATED by ecfft_precompute.py\n")
        f.write(f"// Domain size: 2^{log_n} = {n}\n")
        f.write(f"// Rounds: {log_n}\n\n")
        f.write("#include <array>\n")
        f.write("#include <cstddef>\n\n")
        f.write("namespace bb::basefold::domain_data {\n\n")
        f.write(f"static constexpr size_t LOG_N = {log_n};\n")
        f.write(f"static constexpr size_t N = {n};\n")
        f.write(f"static constexpr size_t NUM_ROUNDS = {log_n};\n\n")

        for i in range(log_n + 1):
            layer = domain.layer(i)
            m = len(layer)
            f.write(f"// Layer {i}: size {m}\n")
            f.write(f"static constexpr std::array<const char*, {m}> LAYER_{i} = {{\n")
            for idx, x in enumerate(layer):
                comma = "," if idx < m - 1 else ""
                f.write(f'    "{field_to_hex(x)}"{comma}\n')
            f.write("};\n\n")

            if i < log_n:
                half = m // 2
                diff_inv = domain.pair_diff_inv[i]
                f.write(f"static constexpr std::array<const char*, {half}> PAIR_DIFF_INV_{i} = {{\n")
                for idx, x in enumerate(diff_inv):
                    comma = "," if idx < half - 1 else ""
                    f.write(f'    "{field_to_hex(x)}"{comma}\n')
                f.write("};\n\n")

        f.write("} // namespace bb::basefold::domain_data\n")

    print(f"Wrote verifier data to {outfile}")


# ============================================================================
# Export: binary domain (compact, loaded by EcfftDomain::load_binary)
# ============================================================================

def export_binary(domain, outfile):
    """Write the domain as a binary file loadable by EcfftDomain::load_binary().

    Format:
      u32 log_n
      u32 n
      u32 num_rounds
      For each layer i = 0..num_rounds:
        u32 m  (layer size)
        m × (4 × u64 LE)   domain points (Montgomery form limbs)
        If i < num_rounds:
          m/2 × (4 × u64 LE)  pair_diff_inv values
    """
    import struct
    log_n = domain.log_n
    n = domain.n

    def fq_to_bytes(x):
        """Convert field element to 4 little-endian u64s (Montgomery form)."""
        v = int(x) % q
        limbs = []
        for _ in range(4):
            limbs.append(v & ((1 << 64) - 1))
            v >>= 64
        return struct.pack('<4Q', *limbs)

    with open(outfile, 'wb') as f:
        f.write(struct.pack('<III', log_n, n, log_n))
        for i in range(log_n + 1):
            layer = domain.layer(i)
            m = len(layer)
            f.write(struct.pack('<I', m))
            for x in layer:
                f.write(fq_to_bytes(x))
            if i < log_n:
                diff_inv = domain.pair_diff_inv[i]
                for x in diff_inv:
                    f.write(fq_to_bytes(x))

    import os
    size_kb = os.path.getsize(outfile) / 1024
    print(f"Wrote binary domain to {outfile} ({size_kb:.1f} KiB)")


# ============================================================================
# Export: test vectors (JSON)
# ============================================================================

def export_test_vectors(domain, outfile):
    """Generate test vectors that validate the ECFFT FRI fold implementation.

    Five tests:
      1. Degree halving (rate-1): fold a degree < n poly, check output degree < n/2
      2. Degree halving (rate-1/4): same but with degree_bound = n/4
      3. Locality: verify that fold[j] depends only on word[j] and word[j + m/2]
      4. Multi-round fold: fold through all rounds, record intermediate values
      5. Verifier query trace: simulate the verifier checking one query index
    """
    import random
    random.seed(42)

    log_n = domain.log_n
    n = domain.n
    L0 = domain.layer(0)

    # --- Test 1: degree halving, rate-1 (degree_bound = n) ---
    coeffs = [random.randint(1, q - 1) for _ in range(n)]
    evals = [poly_eval(coeffs, x) for x in L0]
    z = random.randint(1, q - 1)
    folded = ecfri_fold_step(evals, domain, 0, n, z)

    L1 = domain.layer(1)
    fold_coeffs = lagrange_interp_coeffs(L1, folded)
    deg = poly_degree(fold_coeffs)

    test1 = {
        'name': 'degree_halving_rate1',
        'n': n,
        'degree_bound': n,
        'challenge': field_to_hex(z),
        'input_degree': poly_degree(coeffs),
        'output_degree': deg,
        'output_degree_bound': n // 2,
        'pass': deg < n // 2,
    }

    # --- Test 2: degree halving, rate-1/4 (degree_bound = n/4) ---
    d = n // 4
    low_coeffs = [random.randint(1, q - 1) for _ in range(d)] + [0] * (n - d)
    low_evals = [poly_eval(low_coeffs, x) for x in L0]
    z2 = random.randint(1, q - 1)
    folded2 = ecfri_fold_step(low_evals, domain, 0, d, z2)

    fold_coeffs2 = lagrange_interp_coeffs(L1, folded2)
    deg2 = poly_degree(fold_coeffs2)

    test2 = {
        'name': 'degree_halving_rate_quarter',
        'n': n,
        'degree_bound': d,
        'challenge': field_to_hex(z2),
        'input_degree': poly_degree(low_coeffs),
        'output_degree': deg2,
        'output_degree_bound': d // 2,
        'pass': deg2 < d // 2,
    }

    # --- Test 3: locality (fold[j] depends only on word[j], word[j+m/2]) ---
    z3 = random.randint(1, q - 1)
    evals3 = [random.randint(1, q - 1) for _ in range(n)]
    folded3 = ecfri_fold_step(evals3, domain, 0, n, z3)

    locality_checks = []
    for j in range(min(8, n // 2)):
        local_val = ecfri_verify_query(domain, 0, n, j,
                                       evals3[j], evals3[j + n // 2], z3)
        locality_checks.append({
            'j': j,
            'expected': field_to_hex(folded3[j]),
            'local_computed': field_to_hex(local_val),
            'match': local_val == folded3[j],
        })

    test3 = {
        'name': 'locality',
        'n': n,
        'degree_bound': n,
        'challenge': field_to_hex(z3),
        'checks': locality_checks,
        'pass': all(c['match'] for c in locality_checks),
    }

    # --- Test 4: multi-round fold ---
    alphas = [random.randint(1, q - 1) for _ in range(log_n)]
    mr_evals = [random.randint(1, q - 1) for _ in range(n)]
    current = list(mr_evals)
    d_mr = n
    round_results = []
    for i in range(log_n):
        current = ecfri_fold_step(current, domain, i, d_mr, alphas[i])
        d_mr //= 2
        round_results.append({
            'round': i,
            'size': len(current),
            'first_values': [field_to_hex(v) for v in current[:4]],
        })

    test4 = {
        'name': 'multi_round_fold',
        'n': n,
        'num_rounds': log_n,
        'challenges': [field_to_hex(a) for a in alphas],
        'initial_evals': [field_to_hex(e) for e in mr_evals[:8]],
        'rounds': round_results,
        'final_value': field_to_hex(current[0]),
    }

    # --- Test 5: verifier query trace (follow one query through all rounds) ---
    query_idx = 3 if n > 8 else 0
    trace = []
    current_check = list(mr_evals)
    d_check = n
    idx = query_idx
    for i in range(log_n):
        layer = domain.layer(i)
        m = len(layer)
        half = m // 2
        j = idx if idx < half else idx - half

        s0, s1 = layer[j], layer[j + half]
        f_s0, f_s1 = current_check[j], current_check[j + half]
        expected_fold = ecfri_verify_query(domain, i, d_check, j,
                                           f_s0, f_s1, alphas[i])

        current_check = ecfri_fold_step(current_check, domain, i, d_check,
                                        alphas[i])
        d_check //= 2
        actual_fold = current_check[j]

        trace.append({
            'round': i,
            'pair_index': j,
            's0': field_to_hex(s0),
            's1': field_to_hex(s1),
            'f_s0': field_to_hex(f_s0),
            'f_s1': field_to_hex(f_s1),
            'expected_fold': field_to_hex(expected_fold),
            'actual_fold': field_to_hex(actual_fold),
            'match': expected_fold == actual_fold,
        })
        idx = j

    test5 = {
        'name': 'verifier_query_trace',
        'initial_query_index': query_idx,
        'trace': trace,
        'pass': all(t['match'] for t in trace),
    }

    data = {
        'log_n': log_n,
        'n': n,
        'tests': [test1, test2, test3, test4, test5],
    }

    with open(outfile, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Wrote test vectors to {outfile}")
    for t in data['tests']:
        status = 'PASS' if t.get('pass', True) else 'FAIL'
        print(f"  {t['name']}: {status}")


# ============================================================================
# Curve parameters
# ============================================================================
#
# These define a point of order 2^19 on a good curve over Fq.  They were
# computed by the ecfft-python library (searching for a curve with a large
# 2-power-order subgroup).  We can build domains of size up to 2^19 from this.

PARAMS_2_19 = {
    'a':  6447527507284313751241433169560096957243528132408891969270135568370318968332,
    'bb': 7045312493309525668369461691598070878448993674248805428332703556156728537593,
    'gx': 4829453208919067402500883847334816322244746888452843309002692632160138992140,
    'gy': 18907995215076895123251380389023476008045611862057851369609315058508855857578,
    'k':  19,
}

PARAMS_2_20 = {
    'a':  20433470950457459813605429059280825836446698010609137768462731001356963008044,
    'bb': 4017660946671215398527212635155410452720141402746418430734298542572364476330,
    'gx': 72741324573834444051481096350144623350770302488412565367468391337396010612,
    'gy': 1735668802666030810767374651871167187380082049253283735063130026458754200195,
    'k':  20,
}


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate ECFFT domain data for BaseFold")
    parser.add_argument('--log-n', type=int, default=8,
                        help='Log₂ of domain size (default: 8)')
    parser.add_argument('--output-hpp', type=str, default=None,
                        help='Output C++ header file path')
    parser.add_argument('--output-test', type=str, default=None,
                        help='Output test vectors JSON file path')
    parser.add_argument('--output-bin', type=str, default=None,
                        help='Output binary domain file (for load_binary)')
    args = parser.parse_args()

    log_n = args.log_n
    # Pick the smallest parameter set that supports the requested log_n.
    # Use PARAMS_2_20 for log_n >= 18 to avoid isogeny kernel hits.
    if log_n <= 17:
        params = PARAMS_2_19
    elif log_n <= 20:
        params = PARAMS_2_20
    else:
        raise ValueError(f"log_n={log_n} exceeds maximum supported (20)")

    assert log_n <= params['k'], \
        f"Requested log_n={log_n} exceeds available subgroup order 2^{params['k']}"

    print(f"Building ECFFT domain for log_n = {log_n} "
          f"(domain size = {1 << log_n}), using 2^{params['k']} subgroup...")
    domain = EcfftDomain(params, log_n)
    print(f"  {domain.num_rounds()} rounds, "
          f"layers: {[domain.layer_size(i) for i in range(log_n + 1)]}")

    if args.output_bin:
        export_binary(domain, args.output_bin)

    if args.output_hpp:
        export_verifier_data_hpp(domain, args.output_hpp)

    if args.output_test:
        export_test_vectors(domain, args.output_test)

    if not args.output_hpp and not args.output_test:
        export_test_vectors(domain, f"basefold_test_vectors_{log_n}.json")


if __name__ == '__main__':
    main()
