#!/usr/bin/env python3
"""
Generate ECFFT domain data for BaseFold.

This script builds the isogeny-chain domain structure and exports the
precomputed data needed by the C++ BaseFold implementation.

The FRI fold uses the ECFFT Part II (BSCKL22) pointwise hash:

  For round i with domain L_i, degree bound d_i, challenge z:
    For each pair (s_0, s_1) with psi(s_0) = psi(s_1):
      a = f(s_0) / v(s_0)^{d_i/2 - 1}
      b = f(s_1) / v(s_1)^{d_i/2 - 1}
      fold_z(f)(psi(s_0)) = a + (b - a)/(s_1 - s_0) * (z - s_0)

  For our good-isogeny family, v(x) = x, so the normalization is x^{d_i/2-1}.

Usage:
    python3 ecfft_precompute.py --log-n 8 --output-hpp domain_data.hpp
    python3 ecfft_precompute.py --log-n 8 --output-test test_vectors.json
"""

import sys
import os
import struct
import argparse
import json

# BN254 base field (= Grumpkin scalar field)
q = 21888242871839275222246405745257275088696311157297823662689037894645226208583

def fadd(a, b): return (a + b) % q
def fsub(a, b): return (a - b) % q
def fmul(a, b): return (a * b) % q
def fneg(a):    return (-a) % q
def finv(a):    return pow(a, q - 2, q)
def fpow(a, n): return pow(a, n, q)
def fdiv(a, b): return fmul(a, finv(b))

def batch_inv(vals):
    """Montgomery batch inversion."""
    n = len(vals)
    if n == 0:
        return []
    prefix = [0] * n
    prefix[0] = vals[0]
    for i in range(1, n):
        prefix[i] = fmul(prefix[i-1], vals[i])
    inv_all = finv(prefix[-1])
    result = [0] * n
    for i in range(n-1, 0, -1):
        result[i] = fmul(inv_all, prefix[i-1])
        inv_all = fmul(inv_all, vals[i])
    result[0] = inv_all
    return result

def poly_eval(coeffs, x):
    """Evaluate polynomial [c0, c1, ..., cd] at x."""
    result = 0
    xpow = 1
    for c in coeffs:
        result = fadd(result, fmul(c, xpow))
        xpow = fmul(xpow, x)
    return result


# ── Elliptic curve (Good Curve: y² = x³ + ax² + Bx) ──

class GoodCurve:
    def __init__(self, a, bb):
        self.a = a % q
        self.bb = bb % q
        self.b = fpow(bb, (q + 1) // 4)
        assert fmul(self.b, self.b) == self.bb, "bb is not a QR"


class Point:
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
        if self.inf:
            return other
        if other.inf:
            return self
        if self.x == other.x:
            if self.y == other.y:
                return self.double()
            return Point.infinity(self.curve)
        lam = fdiv(fsub(other.y, self.y), fsub(other.x, self.x))
        x3 = fsub(fsub(fmul(lam, lam), self.curve.a), fadd(self.x, other.x))
        y3 = fsub(fmul(lam, fsub(self.x, x3)), self.y)
        return Point(x3, y3, self.curve)

    def scalar_mul(self, n):
        n = n % (q + 1)
        result = Point.infinity(self.curve)
        base = self
        while n > 0:
            if n & 1:
                result = result + base
            base = base.double()
            n >>= 1
        return result


# ── Isogeny chain ──

class RationalMap:
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
    """Compute the good isogeny and return (psi, h, codomain).

    psi(x) = (x - b)^2 / x  with denominator v(x) = x.
    """
    a, b, bb = curve.a, curve.b, curve.bb
    psi = RationalMap([bb, fneg(fmul(2, b)), 1], [0, 1])
    h = RationalMap([fneg(bb), 0, 1], [0, 0, 1])
    codomain = GoodCurve(fadd(a, fmul(6, b)),
                         fadd(fmul(4, fmul(a, b)), fmul(8, fmul(b, b))))
    return psi, h, codomain


def apply_isogeny(psi, h, codomain, point):
    """Apply isogeny to a point."""
    if point.inf:
        return Point.infinity(codomain)
    new_x = psi(point.x)
    if new_x is None:
        return Point.infinity(codomain)
    h_val = h(point.x)
    new_y = fmul(point.y, h_val)
    return Point(new_x, new_y, codomain)


def build_isogeny_chain(gen, k):
    """Build k good isogenies from a generator of order 2^k."""
    psis, hs, curves = [], [], [gen.curve]
    g = gen
    for _ in range(k):
        r, h, cod = good_isogeny(g.curve)
        psis.append(r)
        hs.append(h)
        curves.append(cod)
        g = apply_isogeny(r, h, cod, g)
    return psis, curves, hs


# ── ECFFT Domain (layer-based, for FRI) ──

class EcfftDomain:
    """
    Stores the domain layers L_0, L_1, ..., L_k connected by rational maps psi_i.

    L_0 is the initial evaluation domain of size n.
    L_{i+1} = psi_i(L_i) has size |L_i|/2.

    Pairing: for each j in range(|L_i|/2), the pair (L_i[j], L_i[j + |L_i|/2])
    maps to L_{i+1}[j] under psi_i.
    """

    def __init__(self, params, log_n):
        assert log_n <= params['k']
        n = 1 << log_n
        self.log_n = log_n
        self.n = n

        curve = GoodCurve(params['a'], params['bb'])
        gen = Point(params['gx'], params['gy'], curve)
        scaled_gen = gen.scalar_mul(1 << (params['k'] - log_n))

        # Build isogeny chain
        self.psis, self.curves, self.hs = build_isogeny_chain(scaled_gen, log_n)

        # Build initial domain L_0: x-coordinates of coset {2G + i*scaled_gen}
        coset = gen.double()
        L0 = []
        acc = Point.infinity(curve)
        for _ in range(n):
            pt = coset + acc
            L0.append(pt.x)
            acc = acc + scaled_gen

        # Build all layers by applying psi
        self.layers = [L0]
        current = L0
        for i in range(log_n):
            psi = self.psis[i]
            m = len(current)
            half = m // 2
            # Next layer: psi applied to first half (== psi applied to second half)
            next_layer = [psi(current[j]) for j in range(half)]
            # Verify 2-to-1 pairing
            for j in range(half):
                assert next_layer[j] == psi(current[j + half]), \
                    f"psi pairing broken at layer {i}, index {j}"
            self.layers.append(next_layer)
            current = next_layer

        # Precompute twiddle data for each round
        # For round i: domain L_i of size m, pairs (j, j+m/2)
        # Twiddle: s_0^e and s_1^e where e = degree_bound/2 - 1
        # We precompute for the case degree_bound = m (rate-1 case, e = m/2 - 1)
        # For rate-rho case, the caller provides the degree bound.
        self._precompute_twiddles()

    def _precompute_twiddles(self):
        """Precompute per-pair twiddle data for each layer.

        For each round i with layer L_i of size m:
          For pair j: s_0 = L_i[j], s_1 = L_i[j + m/2]
          Store: s_0, s_1, 1/(s_1 - s_0) for the verifier fold check.

        The v(x)^e normalization depends on the degree bound and is computed
        at fold time, not precomputed here.
        """
        self.pair_diff_inv = []  # pair_diff_inv[round][j] = 1/(s_1 - s_0)
        for i in range(self.log_n):
            layer = self.layers[i]
            m = len(layer)
            half = m // 2
            diffs = [fsub(layer[j + half], layer[j]) for j in range(half)]
            self.pair_diff_inv.append(batch_inv(diffs))

    def num_rounds(self):
        return self.log_n

    def layer(self, i):
        """Domain L_i."""
        return self.layers[i]

    def layer_size(self, i):
        return len(self.layers[i])

    def pair_at(self, round_idx, j):
        """Return (s_0, s_1) for pair j at round round_idx."""
        layer = self.layers[round_idx]
        m = len(layer)
        half = m // 2
        return layer[j], layer[j + half]


# ── ECFFT2 FRI fold (the paper's pointwise hash) ──

def ecfri_fold_step(word, domain, round_idx, degree_bound, z):
    """
    ECFFT2 Appendix B.2 pointwise FRI hash for RS/polynomial codewords.

    Given evaluations `word` on domain.layer(round_idx) of size m,
    with claimed degree bound `degree_bound`, and challenge `z`:

    For each pair (s_0, s_1) = (L_i[j], L_i[j + m/2]):
      e = degree_bound // 2 - 1
      a = word[j] / s_0^e          (normalize by v(s_0)^e where v(x) = x)
      b = word[j + m//2] / s_1^e
      out[j] = a + (b - a)/(s_1 - s_0) * (z - s_0)

    Returns evaluations on domain.layer(round_idx + 1) of size m/2.
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

        # Normalize by v(s)^e = s^e
        if e == 0:
            a = word[j]
            b = word[j + half]
        else:
            a = fdiv(word[j], fpow(s0, e))
            b = fdiv(word[j + half], fpow(s1, e))

        # Evaluate the line through (s0, a), (s1, b) at z
        slope = fmul(fsub(b, a), diff_inv[j])
        out[j] = fadd(a, fmul(slope, fsub(z, s0)))

    return out


def ecfri_fold(word, domain, degree_bound, challenges):
    """Multi-round ECFFT2 FRI fold.

    Folds `word` through all rounds using the given challenges.
    degree_bound halves each round.
    """
    current = list(word)
    d = degree_bound
    for i, z in enumerate(challenges):
        current = ecfri_fold_step(current, domain, i, d, z)
        d = d // 2
    return current


def ecfri_verify_query(domain, round_idx, degree_bound, j, f_s0, f_s1, z):
    """
    Verifier-side: given a pair opening (f(s_0), f(s_1)) at pair index j
    in round round_idx with degree bound degree_bound and challenge z,
    compute the expected fold value.

    Returns the expected value at domain.layer(round_idx + 1)[j].
    """
    layer = domain.layer(round_idx)
    m = len(layer)
    half = m // 2
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


# ── Lagrange interpolation (for testing) ──

def lagrange_interp_coeffs(xs, ys):
    """Recover polynomial coefficients from evaluations via Lagrange interpolation."""
    n = len(xs)
    assert len(ys) == n
    # Build Lagrange basis coefficients and sum
    coeffs = [0] * n
    for i in range(n):
        # Compute Lagrange basis polynomial L_i(x) = prod_{j!=i} (x - x_j) / (x_i - x_j)
        # Represent as coefficient vector
        basis = [1]  # Start with constant 1
        denom = 1
        for j in range(n):
            if j == i:
                continue
            denom = fmul(denom, fsub(xs[i], xs[j]))
            # Multiply basis by (x - x_j)
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
    """Return the degree of a polynomial (index of last nonzero coefficient)."""
    for i in range(len(coeffs) - 1, -1, -1):
        if coeffs[i] % q != 0:
            return i
    return -1  # zero polynomial


# ── Export functions ──

def field_to_hex(val):
    """Convert field element to 0x-prefixed 64-char hex string (big-endian)."""
    return "0x" + format(val % q, '064x')


def export_verifier_data_hpp(domain, outfile):
    """Export verifier data as a C++ header.

    For each round i, exports:
      - Layer domain points L_i (size m)
      - pair_diff_inv[j] = 1/(s_1 - s_0) for each pair j (size m/2)
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


def export_binary(domain, outfile):
    """Export domain data as binary file for C++ loading."""

    def write_field(f, val):
        v = val % q
        for _ in range(4):
            f.write(struct.pack('<Q', v & ((1 << 64) - 1)))
            v >>= 64

    def write_fields(f, vals):
        for v in vals:
            write_field(f, v)

    with open(outfile, 'wb') as f:
        log_n = domain.log_n
        n = domain.n
        f.write(struct.pack('<I', log_n))
        f.write(struct.pack('<I', n))
        f.write(struct.pack('<I', log_n))  # num_rounds

        for i in range(log_n + 1):
            layer = domain.layer(i)
            m = len(layer)
            f.write(struct.pack('<I', m))
            write_fields(f, layer)

            if i < log_n:
                half = m // 2
                write_fields(f, domain.pair_diff_inv[i])

    print(f"Wrote binary data to {outfile} ({os.path.getsize(outfile)} bytes)")


def export_test_vectors(domain, outfile):
    """Export test vectors verifying the ECFFT2 FRI fold."""
    import random
    random.seed(42)

    log_n = domain.log_n
    n = domain.n
    L0 = domain.layer(0)

    # --- Test 1: Degree-halving (rate-1 case: degree_bound = n) ---
    coeffs = [random.randint(1, q - 1) for _ in range(n)]
    evals = [poly_eval(coeffs, x) for x in L0]
    z = random.randint(1, q - 1)
    folded = ecfri_fold_step(evals, domain, 0, n, z)

    # The folded values should represent a degree < n/2 polynomial on L_1
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

    # --- Test 2: Degree-halving with rate < 1 (degree_bound < n) ---
    d = n // 4  # rate 1/4
    low_coeffs = [random.randint(1, q - 1) for _ in range(d)] + [0] * (n - d)
    low_evals = [poly_eval(low_coeffs, x) for x in L0]
    z2 = random.randint(1, q - 1)
    folded2 = ecfri_fold_step(low_evals, domain, 0, d, z2)

    L1 = domain.layer(1)
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

    # --- Test 3: Locality test ---
    # Verify that the fold value at index j depends only on word[j] and word[j+m/2]
    z3 = random.randint(1, q - 1)
    evals3 = [random.randint(1, q - 1) for _ in range(n)]
    folded3 = ecfri_fold_step(evals3, domain, 0, n, z3)

    locality_checks = []
    for j in range(min(8, n // 2)):
        local_val = ecfri_verify_query(domain, 0, n, j, evals3[j], evals3[j + n // 2], z3)
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

    # --- Test 4: Multi-round fold ---
    alphas = [random.randint(1, q - 1) for _ in range(log_n)]
    mr_evals = [random.randint(1, q - 1) for _ in range(n)]
    current = list(mr_evals)
    d_mr = n
    round_results = []
    for i in range(log_n):
        current = ecfri_fold_step(current, domain, i, d_mr, alphas[i])
        d_mr = d_mr // 2
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

    # --- Test 5: Verifier query trace through all rounds ---
    query_idx = 3 if n > 8 else 0
    trace = []
    current_check = list(mr_evals)
    d_check = n
    idx = query_idx
    for i in range(log_n):
        layer = domain.layer(i)
        m = len(layer)
        half = m // 2
        j = idx if idx < half else idx - half  # normalize to pair index
        if idx >= half:
            # idx is in second half, pair partner is idx - half
            j = idx - half
        else:
            j = idx

        s0, s1 = layer[j], layer[j + half]
        f_s0, f_s1 = current_check[j], current_check[j + half]
        expected_fold = ecfri_verify_query(domain, i, d_check, j, f_s0, f_s1, alphas[i])

        # Advance
        current_check = ecfri_fold_step(current_check, domain, i, d_check, alphas[i])
        d_check = d_check // 2
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

        # Next round: the fold value at pair index j maps to index j in the next layer
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


# ── Curve parameters ──

# Parameters for 2^19-order subgroup (from ecfft-python)
PARAMS_2_19 = {
    'a': 6447527507284313751241433169560096957243528132408891969270135568370318968332,
    'bb': 7045312493309525668369461691598070878448993674248805428332703556156728537593,
    'gx': 4829453208919067402500883847334816322244746888452843309002692632160138992140,
    'gy': 18907995215076895123251380389023476008045611862057851369609315058508855857578,
    'k': 19,
}


def main():
    parser = argparse.ArgumentParser(description="Generate ECFFT domain data for BaseFold")
    parser.add_argument('--log-n', type=int, default=8,
                        help='Log2 of domain size (default: 8)')
    parser.add_argument('--output-bin', type=str, default=None,
                        help='Output binary file path')
    parser.add_argument('--output-hpp', type=str, default=None,
                        help='Output C++ header file path')
    parser.add_argument('--output-test', type=str, default=None,
                        help='Output test vectors JSON file path')
    args = parser.parse_args()

    log_n = args.log_n
    assert log_n <= PARAMS_2_19['k'], \
        f"Requested log_n={log_n} exceeds available subgroup order 2^{PARAMS_2_19['k']}"

    print(f"Building ECFFT domain for log_n = {log_n} (domain size = {1 << log_n})...")
    domain = EcfftDomain(PARAMS_2_19, log_n)
    print(f"  {domain.num_rounds()} rounds, layers: {[domain.layer_size(i) for i in range(log_n + 1)]}")

    if args.output_hpp:
        export_verifier_data_hpp(domain, args.output_hpp)

    if args.output_bin:
        export_binary(domain, args.output_bin)

    if args.output_test:
        export_test_vectors(domain, args.output_test)

    if not any([args.output_hpp, args.output_bin, args.output_test]):
        export_test_vectors(domain, f"basefold_test_vectors_{log_n}.json")


if __name__ == '__main__':
    main()
