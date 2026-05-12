#!/usr/bin/env python3
"""Rank sanity check for sparse Shplemini PCS masking.

Builds the leakage matrix B for the KZG (tail-halving support) and IPA
(dyadic-cut support) sparse masking layouts, samples non-degenerate
Fiat-Shamir / trapdoor values from the BN254 scalar field, and prints
`rank(B)`. Each rank should equal `|S|`, which matches the analytical
arguments in SHPLEMINI_ZK_MASKING.md (the analytical proofs are the source of
truth; this script only catches construction bugs).

Optimizations vs the previous version:
- Closed-form leakage columns from the explicit `lambda_t(s) * point^k`
  formula, instead of repeatedly folding the full coefficient vector.
- Precomputed power tables for tau, z, +/- r_t, shared across all support
  entries within a single sample.
- Single matrix per sample (KZG: Gemini + Shplonk:Q + KZG:W stacked
  together); single Gauss pass for rank.
"""

from __future__ import annotations

import argparse
import random

P = 21888242871839275222246405745257275088548364400416034343698204186575808495617


# --------------------------- field arithmetic -------------------------------


def inv(x: int) -> int:
    return pow(x % P, P - 2, P)


def power_table(base: int, length: int) -> list[int]:
    """[base^0, base^1, ..., base^(length-1)] mod P."""
    out = [1] * length
    for k in range(1, length):
        out[k] = out[k - 1] * base % P
    return out


def lambda_at(u: list[int], s: int) -> list[int]:
    """[lambda_0(s), ..., lambda_d(s)], the Gemini fold weights for E_s."""
    out = [1]
    for t, u_t in enumerate(u):
        factor = u_t if (s >> t) & 1 else (1 - u_t) % P
        out.append(out[-1] * factor % P)
    return out


def rank_mod_p(rows: list[list[int]]) -> int:
    """Rank over GF(P) via row-echelon Gauss elimination (no rref)."""
    rows = [r[:] for r in rows]
    m = len(rows)
    n = len(rows[0]) if rows else 0
    rank = 0
    for col in range(n):
        pivot = next((r for r in range(rank, m) if rows[r][col] % P), None)
        if pivot is None:
            continue
        rows[rank], rows[pivot] = rows[pivot], rows[rank]
        inv_p = inv(rows[rank][col])
        pr = rows[rank]
        for r in range(rank + 1, m):
            f = rows[r][col]
            if f % P == 0:
                continue
            f = f * inv_p % P
            rr = rows[r]
            for k in range(col, n):
                rr[k] = (rr[k] - f * pr[k]) % P
        rank += 1
        if rank == m or rank == n:
            break
    return rank


# --------------------------- challenge sampling -----------------------------


def random_challenges(d: int, rng: random.Random):
    """Sample (u, nu, z, tau, r_pow, neg_r_pow) avoiding denominator zeros.

    `r_pow[t] = r^(2^t)` is the Gemini opening point at level t.
    """
    while True:
        u = [rng.randrange(1, P) for _ in range(d)]
        r = rng.randrange(1, P)
        nu = rng.randrange(1, P)
        z = rng.randrange(1, P)
        tau = rng.randrange(1, P)
        r_pow = [pow(r, 1 << t, P) for t in range(d)]
        neg_r_pow = [(-x) % P for x in r_pow]
        if z == tau:
            continue
        bad = any(
            z in (rt, nrt) or tau in (rt, nrt)
            for rt, nrt in zip(r_pow, neg_r_pow)
        )
        if not bad:
            return u, nu, z, tau, r_pow, neg_r_pow


# --------------------------- KZG leakage matrix -----------------------------


def kzg_matrix(d, support, u, nu, z, tau, r_pow, neg_r_pow):
    """KZG leakage matrix, rows x |S|.

    Row layout (total 2d + 3 rows):
      0:               M(u)        = lambda_d(s)
      1..d:            M_t(tau)    = lambda_t(s) * tau^(s >> t),     t=0..d-1
      d+1..2d:         M_t(-r_t)   = lambda_t(s) * (-r_t)^(s >> t),  t=0..d-1
      2d+1:            Shplonk Q(tau)
      2d+2:            KZG W(tau) = (Q(tau) - Q(z)) / (tau - z)

    Q(X) = sum_t [ nu^(2t)   (M_t(X) - M_t(r_t))  / (X - r_t)
                 + nu^(2t+1) (M_t(X) - M_t(-r_t)) / (X + r_t) ].
    """
    n = 1 << d
    tau_pow = power_table(tau, n)
    z_pow = power_table(z, n)
    pos_pow = [power_table(r_pow[t], (n >> t) or 1) for t in range(d)]
    neg_pow = [power_table(neg_r_pow[t], (n >> t) or 1) for t in range(d)]

    inv_tau_minus_pos = [inv((tau - r_pow[t]) % P) for t in range(d)]
    inv_tau_minus_neg = [inv((tau - neg_r_pow[t]) % P) for t in range(d)]
    inv_z_minus_pos = [inv((z - r_pow[t]) % P) for t in range(d)]
    inv_z_minus_neg = [inv((z - neg_r_pow[t]) % P) for t in range(d)]
    inv_tau_minus_z = inv((tau - z) % P)

    rows = [[0] * len(support) for _ in range(2 * d + 3)]

    for col, s in enumerate(support):
        lam = lambda_at(u, s)
        rows[0][col] = lam[d]

        m_tau = [0] * d
        m_pos = [0] * d
        m_neg = [0] * d
        m_z = [0] * d
        for t in range(d):
            k = s >> t
            lt = lam[t]
            m_tau[t] = lt * tau_pow[k] % P
            m_z[t] = lt * z_pow[k] % P
            m_pos[t] = lt * pos_pow[t][k] % P
            m_neg[t] = lt * neg_pow[t][k] % P
            rows[1 + t][col] = m_tau[t]
            rows[1 + d + t][col] = m_neg[t]

        q_tau = 0
        q_z = 0
        nu_pow = 1
        for t in range(d):
            q_tau = (q_tau + nu_pow * (m_tau[t] - m_pos[t]) * inv_tau_minus_pos[t]) % P
            q_z = (q_z + nu_pow * (m_z[t] - m_pos[t]) * inv_z_minus_pos[t]) % P
            nu_pow = nu_pow * nu % P
            q_tau = (q_tau + nu_pow * (m_tau[t] - m_neg[t]) * inv_tau_minus_neg[t]) % P
            q_z = (q_z + nu_pow * (m_z[t] - m_neg[t]) * inv_z_minus_neg[t]) % P
            nu_pow = nu_pow * nu % P
        rows[2 * d + 1][col] = q_tau
        rows[2 * d + 2][col] = (q_tau - q_z) * inv_tau_minus_z % P

    return rows


# --------------------------- IPA leakage matrix -----------------------------


def ipa_matrix(d, support, u, nu, r_pow, neg_r_pow):
    """IPA leakage matrix, rows x |S|.

    The AGM-level leakage from M after Shplonk batching is the coefficient
    vector of the polynomial G(X) that gets IPA-opened at a single point;
    IPA folding does not increase rank, so checking rank at the
    coefficient level is sufficient.

    Row layout (total N + 1 rows):
      0:        M(u)             = lambda_d(s)
      1..N:     coefficient of X^j in G(X), j = 0..N-1.

    G(X) per E_s, using (X^k - p^k)/(X - p) = sum_{j<k} p^(k-1-j) X^j with
    k = s >> t and p = +/- r_t:
      coeff_j(G_{E_s}) =
          sum_t lam[t] * [ nu^(2t)   * (+r_t)^(k-1-j)
                         + nu^(2t+1) * (-r_t)^(k-1-j) ]    for j < k.
    """
    n = 1 << d
    pos_pow = [power_table(r_pow[t], (n >> t) or 1) for t in range(d)]
    neg_pow = [power_table(neg_r_pow[t], (n >> t) or 1) for t in range(d)]

    rows = [[0] * len(support) for _ in range(1 + n)]

    for col, s in enumerate(support):
        lam = lambda_at(u, s)
        rows[0][col] = lam[d]
        nu_pow = 1
        for t in range(d):
            k = s >> t
            for sign_table in (pos_pow[t], neg_pow[t]):
                lam_nu = lam[t] * nu_pow % P
                for j in range(k):
                    rows[1 + j][col] = (rows[1 + j][col] + lam_nu * sign_table[k - 1 - j]) % P
                nu_pow = nu_pow * nu % P
    return rows


# --------------------------- supports ---------------------------------------


def halving_tail_support(d: int, extent: int | None = None) -> list[int]:
    """KZG tail-halving support of size min(2d, 2^d).

    [E-1, E-2, N/2, N/2-1, N/4, N/4-1, ..., 2, 1], where E = round_up(extent, 2),
    truncated / tail-filled to exactly min(2d, 2^d) entries.
    """
    n = 1 << d
    extent = n if extent is None else extent
    if not 0 < extent <= n:
        raise ValueError(f"extent must be in [1, 2^d], got extent={extent}, d={d}")
    E = min(n, extent if extent % 2 == 0 else extent + 1)

    seen, support = set(), []

    def add(i: int) -> None:
        if 0 <= i < n and i not in seen:
            seen.add(i)
            support.append(i)

    add(E - 1)
    add(E - 2)
    for level in range(1, d):
        base = n >> level
        add(base)
        add(base - 1)
    i = E - 1
    while len(support) < min(2 * d, n):
        add(i)
        i -= 1
    return support[: min(2 * d, n)]


def ipa_dyadic_cut_support(d: int) -> list[int]:
    """IPA support: four entries around every dyadic cut, plus top tail."""
    n = 1 << d
    seen, support = set(), []

    def add(i: int) -> None:
        if 0 <= i < n and i not in seen:
            seen.add(i)
            support.append(i)

    for i in (n - 4, n - 3, n - 2, n - 1):
        add(i)
    for q in range(1, d):
        for delta in (-2, -1, 0, 1):
            add((1 << q) + delta)
    return support


# --------------------------- driver -----------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--min-d", type=int, default=2)
    p.add_argument("--max-d", type=int, default=12)
    p.add_argument("--samples", type=int, default=2)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument(
        "--extent",
        type=int,
        default=None,
        help="Optional non-dyadic max_end_index for the halving-tail top pair.",
    )
    p.add_argument("--scheme", choices=["both", "kzg", "ipa"], default="both")
    return p.parse_args()


def check_kzg(args: argparse.Namespace, rng: random.Random) -> None:
    print("== KZG, tail-halving support ==")
    print("rank(B) should equal |S| = min(2d, 2^d).")
    for d in range(args.min_d, args.max_d + 1):
        support = halving_tail_support(d, args.extent)
        ranks = set()
        for _ in range(args.samples):
            ch = random_challenges(d, rng)
            ranks.add(rank_mod_p(kzg_matrix(d, support, *ch)))
        status = "OK" if ranks == {len(support)} else "FAIL"
        print(f"  d={d:2d}  |S|={len(support):3d}  rank={sorted(ranks)}  {status}")
    print()


def check_ipa(args: argparse.Namespace, rng: random.Random) -> None:
    print("== IPA, dyadic-cut support ==")
    print("rank(B) should equal |S|.")
    for d in range(args.min_d, args.max_d + 1):
        support = ipa_dyadic_cut_support(d)
        if len(support) >= (1 << d):
            print(f"  d={d:2d}  |S|={len(support):3d}  (skipped: support saturates poly)")
            continue
        ranks = set()
        for _ in range(args.samples):
            u, nu, _, _, r_pow, neg_r_pow = random_challenges(d, rng)
            ranks.add(rank_mod_p(ipa_matrix(d, support, u, nu, r_pow, neg_r_pow)))
        status = "OK" if ranks == {len(support)} else "FAIL"
        print(f"  d={d:2d}  |S|={len(support):3d}  rank={sorted(ranks)}  {status}")


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    if args.scheme in ("both", "kzg"):
        check_kzg(args, rng)
    if args.scheme in ("both", "ipa"):
        check_ipa(args, rng)


if __name__ == "__main__":
    main()
