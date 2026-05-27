"""
Symbolic and numerical verification for SHPLEMINI_ZK_MASKING.md.

Verifies, at d = 3 (symbolic) and d = 4 (symbolic block structure + numerical det):

  1. The matrix B in the (D', M^new) basis is NOT block-upper-triangular under the
     fresh-column reordering C_{d-1} | C_{d-2} | ... | C_0 alone — D-rows triangularise
     from the staircase, but M-rows leak into lower-level column blocks.

  2. The M-row leakage has the closed form
        M_k^new(E_s) = prod_{i=j+1}^{k-1} (1 - u_i) * M_{j+1}^new(E_s)
     for every s in C_j with j < k.

  3. The adjacent-block identity holds:
        M_k^new(C_{k-1}) = u_{k-1} * D_{k-1}'(C_{k-1}).

  4. The row operation
        N_k = M_k^new - u_{k-1} D_{k-1}' - (1 - u_{k-1}) M_{k-1}^new
     (applied in parallel, using the ORIGINAL M_{k-1}^new) makes (D_k', N_k) vanish on
     every C_j with j < k, producing a block-lower-triangular matrix when columns are
     ordered C_0 | C_1 | ... | C_{d-1} (equivalently block-upper if reversed).

  5. det B is preserved by the row op (symbolic at d=3) and matches the conjectured
     closed form (symbolic at d=3, numerical at d=4).

Run with sympy and a standard Python (Fraction) — no other dependencies.
"""

import sympy as sp
from fractions import Fraction as F


# ---------- algebraic primitives ----------

def L(b, us):
    """Multilinear Lagrange L_b(u_0, ..., u_{len(us)-1}). Works for sympy or Fraction."""
    one = sp.Integer(1) if (us and isinstance(us[0], sp.Expr)) else F(1)
    p = one
    for a in range(len(us)):
        p *= us[a] if ((b >> a) & 1) else (1 - us[a])
    return p


def phi(m, tau, y):
    """phi_m(tau, y) = (tau^m - y^m) / (tau - y); phi_0 := 0."""
    if m <= 0:
        return sp.Integer(0)
    return sum(tau ** (m - 1 - j) * y ** j for j in range(m))


# ---------- matrix builders ----------

def adapted_rows(d, S, tau, rs, us):
    """Rows (D_0', M_0^new, D_1', M_1^new, ..., D_{d-1}', M_{d-1}^new).

    D_k' = D_k / (tau + r_k) = ell_k * phi_{q_k}(tau, -r_k).
    M_k^new = M_k + r_k * D_k'  (row normalisation from SHPLEMINI_ZK_MASKING.md §2).
    """
    rows, labels = [], []
    for t in range(d):
        Dp_row, Mn_row = [], []
        for s in S:
            q = s // (2 ** t)
            ell = L(s % (2 ** t), us[:t]) if t > 0 else sp.Integer(1)
            Dp = ell * phi(q, tau, -rs[t])
            Mn = ell * (-rs[t]) ** q + rs[t] * Dp
            Dp_row.append(sp.expand(Dp))
            Mn_row.append(sp.expand(Mn))
        rows.append(Dp_row); labels.append(f"D{t}'")
        rows.append(Mn_row); labels.append(f"M{t}n")
    return rows, labels


def adapted_rows_numeric(d, S, tau, rs, us):
    """Same as adapted_rows but with Python Fraction inputs (no sympy)."""
    rows = []
    for t in range(d):
        Dp_row, Mn_row = [], []
        for s in S:
            q = s // (2 ** t)
            ell = L(s % (2 ** t), us[:t]) if t > 0 else F(1)
            if q <= 0:
                Dp = F(0)
            else:
                Dp = ell * sum(tau ** (q - 1 - j) * (-rs[t]) ** j for j in range(q))
            Mn = ell * (-rs[t]) ** q + rs[t] * Dp
            Dp_row.append(Dp)
            Mn_row.append(Mn)
        rows.append(Dp_row); rows.append(Mn_row)
    return rows


def original_rows_numeric(d, S, tau, rs, us):
    """Original B rows (D_t, M_t) on S, with Fraction inputs."""
    rows = []
    for t in range(d):
        D_row, M_row = [], []
        for s in S:
            q = s // (2 ** t)
            ell = L(s % (2 ** t), us[:t]) if t > 0 else F(1)
            M_row.append(ell * (-rs[t]) ** q)
            D_row.append(F(0) if q == 0 else ell * (tau ** q - (-rs[t]) ** q))
        rows.append(D_row); rows.append(M_row)
    return rows


def fresh_columns(S, d):
    """C_k = {s in S : q_k(s) >= 1, q_{k+1}(s) = 0} for k < d-1; C_{d-1} = {s : q_{d-1}(s) >= 1}."""
    A = [[s for s in S if (s // (2 ** k)) >= 1] for k in range(d)]
    C = [[s for s in A[k] if s not in A[k + 1]] for k in range(d - 1)] + [list(A[d - 1])]
    leftover = [s for s in S if s not in A[0]]
    return C, leftover


def triangularise(d, S, rows, us):
    """Apply N_k = M_k^new - u_{k-1} D_{k-1}' - (1-u_{k-1}) M_{k-1}^new using the
    ORIGINAL rows (parallel application, not sequential)."""
    new_rows = [list(r) for r in rows]
    for k in range(1, d):
        Mk_idx = 2 * k + 1
        Dkm1_idx = 2 * (k - 1)
        Mkm1_idx = 2 * (k - 1) + 1
        for col in range(len(S)):
            new_rows[Mk_idx][col] = sp.expand(
                rows[Mk_idx][col]
                - us[k - 1] * rows[Dkm1_idx][col]
                - (1 - us[k - 1]) * rows[Mkm1_idx][col]
            )
    return new_rows


# ---------- numerical determinant for Fraction matrices ----------

def det_frac(M):
    n = len(M)
    if n == 1: return M[0][0]
    if n == 2: return M[0][0] * M[1][1] - M[0][1] * M[1][0]
    total = F(0)
    for j in range(n):
        if M[0][j] == 0: continue
        sub = [[M[i][k] for k in range(n) if k != j] for i in range(1, n)]
        total += ((-1) ** j) * M[0][j] * det_frac(sub)
    return total


# ---------- conjectured closed forms ----------

def expected_d3_sym(tau, rs, us):
    r0, r1, r2 = rs; u0, u1 = us[0], us[1]
    return sp.expand(
        - r0 ** 2 * tau ** 2 * (r0 ** 4 - tau ** 4) * (r1 ** 2 - tau ** 2)
        * (tau + r2) * (1 - u0) * u0
        * (u0 + (1 - u0) * r0) * (u0 - (1 - u0) * tau)
        * (u1 + (1 - u1) * r1) * (u1 - (1 - u1) * tau)
    )


def expected_d4_numeric(tau, rs, us):
    r0, r1, r2, r3 = rs; u0, u1, u2 = us[0], us[1], us[2]
    leading = r0 ** 2 * tau ** 2 * (tau ** 12 - r0 ** 12)
    vand = (tau ** 2 - r1 ** 2) * (tau ** 2 - r2 ** 2) * (tau + r3)
    Lag = (1 - u0) * u0 * (1 - u0) * (1 - u1) * u0 * u1
    Aff = ((u0 + (1 - u0) * r0) * (u0 - (1 - u0) * tau)
           * (u1 + (1 - u1) * r1) * (u1 - (1 - u1) * tau)
           * (u2 + (1 - u2) * r2) * (u2 - (1 - u2) * tau))
    return leading * vand * Lag * Aff


# ---------- pretty-print block structure ----------

def print_block_structure(d, S, rows, labels, C, leftover, name):
    print(f"\n--- {name} block structure ---")
    col_order = []
    for k in reversed(range(d)):
        col_order.extend(C[k])
    col_order.extend(leftover)
    perm = [S.index(s) for s in col_order]
    rows_p = [[r[perm[j]] for j in range(len(S))] for r in rows]
    sizes = [len(C[d - 1 - i]) for i in range(d)] + [len(leftover)]
    starts = [0]
    for sz in sizes: starts.append(starts[-1] + sz)
    head = "          " + "   ".join(f"L{d-1-i}({sizes[i]})" for i in range(d))
    if leftover: head += f"   left({len(leftover)})"
    print(head)
    for k in range(d):
        for half in (0, 1):
            r = 2 * k + half
            cells = []
            for bidx in range(d):
                cs, ce = starts[bidx], starts[bidx + 1]
                block = [rows_p[r][j] for j in range(cs, ce)]
                cells.append(" 0 " if all(b == 0 for b in block) else " . ")
            print(f"  {labels[r]:7s}  " + "   ".join(cells))
    return rows_p, col_order, perm, starts


# =================================================================
# Verification driver
# =================================================================

def verify_d3_symbolic():
    print("=" * 60)
    print("d=3 tail-halving, symbolic")
    print("=" * 60)
    S = [7, 6, 4, 3, 2, 1]
    tau = sp.Symbol("tau"); rs = sp.symbols("r0:3"); us = sp.symbols("u0:3")
    rows, labels = adapted_rows(3, S, tau, rs, us)
    C, leftover = fresh_columns(S, 3)
    for k in range(3): print(f"  C_{k} = {C[k]}")
    if leftover: print(f"  leftover = {leftover}")

    print_block_structure(3, S, rows, labels, C, leftover, "before row op")

    # M-row leakage closed form
    print("\n--- M-row leakage check ---")
    print("  Hypothesis: M_k^new(s)|_{s in C_j, j<k} = prod_{i=j+1..k-1}(1-u_i) * M_{j+1}^new(s)")
    for k in range(1, 3):
        Mk = rows[2 * k + 1]
        for j in range(k):
            for s in C[j]:
                col = S.index(s)
                actual = sp.simplify(Mk[col])
                if j + 1 < 3:
                    Mjp1 = rows[2 * (j + 1) + 1][col]
                    coeff = sp.prod([1 - us[i] for i in range(j + 1, k)])
                    pred = sp.expand(coeff * Mjp1)
                    ok = sp.simplify(actual - pred) == 0
                    print(f"  M_{k}^new(s={s}) | C_{j}: actual={actual} pred={sp.simplify(pred)}  {'OK' if ok else 'FAIL'}")

    # Adjacent-block identity
    print("\n--- Adjacent identity: M_k^new(C_{k-1}) = u_{k-1} D_{k-1}'(C_{k-1}) ---")
    for k in range(1, 3):
        Mk = rows[2 * k + 1]; Dkm1 = rows[2 * (k - 1)]
        for s in C[k - 1]:
            col = S.index(s)
            actual = sp.simplify(Mk[col])
            pred = sp.simplify(us[k - 1] * Dkm1[col])
            ok = sp.simplify(actual - pred) == 0
            print(f"  M_{k}^new(s={s}) =?  u_{k-1} * D_{k-1}'(s):  actual={actual} pred={pred}  {'OK' if ok else 'FAIL'}")

    # Apply row op
    new_rows = triangularise(3, S, rows, us)
    new_labels = list(labels)
    for k in range(1, 3): new_labels[2 * k + 1] = f"N{k}"
    rows_p, col_order, perm, starts = print_block_structure(
        3, S, new_rows, new_labels, C, leftover, "after row op")

    # det check
    Mmat = sp.Matrix(new_rows)
    det_adapted = sp.expand(Mmat.det())
    det_B = sp.expand(sp.prod([tau + rs[k] for k in range(3)]) * det_adapted)
    diff = sp.simplify(det_B - expected_d3_sym(tau, rs, us))
    print(f"\n  det B (after row op, with Lemma-A prefactor) - expected = {diff}")
    print(f"  ==> det B identity {'HOLDS' if diff == 0 else 'FAILS'} symbolically at d=3")

    # Diagonal-block determinants
    print("\n--- Diagonal blocks (D_k', N_k) on C_k ---")
    for k in range(3):
        cs = starts[3 - 1 - k]; ce = starts[3 - k]
        cols = list(range(cs, ce))
        if not cols: continue
        block = sp.Matrix([[rows_p[2 * k][j] for j in cols],
                           [rows_p[2 * k + 1][j] for j in cols]])
        print(f"\n  (D_{k}', N_{k}) on C_{k}={[col_order[j] for j in cols]} shape {block.shape}:")
        if block.shape[0] == block.shape[1]:
            print(f"    det = {sp.factor(block.det())}")
        else:
            from itertools import combinations
            for sub in combinations(range(block.shape[1]), block.shape[0]):
                m = block[:, list(sub)]
                print(f"    minor {[col_order[cols[i]] for i in sub]}: det = {sp.factor(m.det())}")


def verify_d4_symbolic_structure():
    print("\n" + "=" * 60)
    print("d=4 tail-halving, symbolic block structure")
    print("=" * 60)
    S = [15, 14, 8, 7, 4, 3, 2, 1]
    tau = sp.Symbol("tau"); rs = sp.symbols("r0:4"); us = sp.symbols("u0:4")
    rows, labels = adapted_rows(4, S, tau, rs, us)
    C, leftover = fresh_columns(S, 4)
    for k in range(4): print(f"  C_{k} = {C[k]}")

    print_block_structure(4, S, rows, labels, C, leftover, "before row op")

    # Leakage identities
    print("\n--- M-row leakage closed form ---")
    fail = 0
    for k in range(1, 4):
        Mk = rows[2 * k + 1]
        for j in range(k):
            for s in C[j]:
                col = S.index(s)
                actual = sp.simplify(Mk[col])
                if j + 1 < 4:
                    Mjp1 = rows[2 * (j + 1) + 1][col]
                    coeff = sp.prod([1 - us[i] for i in range(j + 1, k)])
                    pred = sp.expand(coeff * Mjp1)
                    if sp.simplify(actual - pred) != 0:
                        fail += 1
                        print(f"  FAIL: M_{k}^new(s={s}) | C_{j}: actual={actual} pred={pred}")
    print(f"  {'OK' if fail == 0 else f'{fail} FAILURES'} (M-row leakage identity over all (k,j) pairs)")

    print("\n--- Adjacent identity M_k^new(C_{k-1}) = u_{k-1} D_{k-1}'(C_{k-1}) ---")
    fail = 0
    for k in range(1, 4):
        Mk = rows[2 * k + 1]; Dkm1 = rows[2 * (k - 1)]
        for s in C[k - 1]:
            col = S.index(s)
            if sp.simplify(Mk[col] - us[k - 1] * Dkm1[col]) != 0:
                fail += 1
                print(f"  FAIL: k={k}, s={s}")
    print(f"  {'OK' if fail == 0 else f'{fail} FAILURES'} (adjacent identity over all (k, s in C_{{k-1}}))")

    # Apply row op
    new_rows = triangularise(4, S, rows, us)
    new_labels = list(labels)
    for k in range(1, 4): new_labels[2 * k + 1] = f"N{k}"
    rows_p, col_order, perm, starts = print_block_structure(
        4, S, new_rows, new_labels, C, leftover, "after row op")

    # Diagonal-block determinants
    print("\n--- Diagonal blocks (D_k', N_k) on C_k ---")
    for k in range(4):
        cs = starts[4 - 1 - k]; ce = starts[4 - k]
        cols = list(range(cs, ce))
        if not cols: continue
        block = sp.Matrix([[rows_p[2 * k][j] for j in cols],
                           [rows_p[2 * k + 1][j] for j in cols]])
        print(f"\n  (D_{k}', N_{k}) on C_{k}={[col_order[j] for j in cols]} shape {block.shape}:")
        if block.shape[0] == block.shape[1]:
            print(f"    det = {sp.factor(block.det())}")
        else:
            from itertools import combinations
            for sub in combinations(range(block.shape[1]), block.shape[0]):
                m = block[:, list(sub)]
                print(f"    minor {[col_order[cols[i]] for i in sub]}: det = {sp.factor(m.det())}")


def verify_d4_numeric_det():
    print("\n" + "=" * 60)
    print("d=4 tail-halving, numerical det B vs conjectured closed form")
    print("=" * 60)
    S = [15, 14, 8, 7, 4, 3, 2, 1]
    trials = [
        (F(2), [F(3), F(5), F(7), F(11)], [F(1, 2), F(1, 3), F(1, 5), F(2, 7)]),
        (F(13), [F(5), F(7), F(11), F(17)], [F(2, 7), F(3, 11), F(5, 19), F(7, 23)]),
        (F(7), [F(3), F(11), F(13), F(19)], [F(1, 4), F(2, 5), F(3, 8), F(4, 13)]),
        (F(2, 3), [F(5, 7), F(11, 13), F(17, 19), F(23, 29)],
                  [F(1, 11), F(3, 17), F(5, 23), F(7, 29)]),
    ]
    for tau_v, rs_v, us_v in trials:
        rows = original_rows_numeric(4, S, tau_v, rs_v, us_v)
        detB = det_frac(rows)
        exp = expected_d4_numeric(tau_v, rs_v, us_v)
        ratio = detB / exp if exp != 0 else None
        ok = ratio == F(1)
        print(f"  tau={tau_v}: detB/expected = {ratio}  {'OK' if ok else 'FAIL'}")


def verify_lemma5():
    """Verify Lemma 5 (the Casoratian identity used in Lemma 6's proof):
        X_2 X_{E-1} - X_3 X_{E-2} = tau * r_0 * phi_{E-4}(tau,-r_0) * A_0^+ * A_0^-
    where X_m := (1-u_0) phi_m(tau,-r_0) - u_0 phi_{m-1}(tau,-r_0).
    Checked symbolically at E in {8, 12, 16, 20, 24, 28, 32, 64}.
    """
    print("\n" + "=" * 60)
    print("Lemma 5 (Casoratian) symbolic verification")
    print("=" * 60)
    tau_, r0_, u0_ = sp.symbols("tau r0 u0")

    def phi_local(m):
        if m <= 0: return sp.Integer(0)
        return sum(tau_ ** (m - 1 - j) * (-r0_) ** j for j in range(m))

    def X_local(m):
        return sp.expand((1 - u0_) * phi_local(m) - u0_ * phi_local(m - 1))

    Aplus = u0_ + (1 - u0_) * r0_
    Aminus = u0_ - (1 - u0_) * tau_

    for E in [8, 12, 16, 20, 24, 28, 32, 64]:
        LHS = sp.expand(X_local(2) * X_local(E - 1) - X_local(3) * X_local(E - 2))
        RHS = sp.expand(tau_ * r0_ * phi_local(E - 4) * Aplus * Aminus)
        diff = sp.simplify(LHS - RHS)
        print(f"  E={E:>3}: LHS - RHS = {diff}  {'OK' if diff == 0 else 'FAIL'}")


def verify_low_tail_d3():
    """Verify the low-tail rank-drop conjecture (SHPLEMINI_ZK_MASKING.md) at
    d=3, E=6, S=[5,4,3,2,1,0]:
      - rank(B) = 2d-1 = 5 (raw block drops rank by one),
      - N_2 = lambda * D_2' on the full support, lambda the boundary ratio,
      - the six reduced 5x5 minors (delete N_2 row + one column) factor cleanly.
    """
    print("\n" + "=" * 60)
    print("Low-tail rank drop at d=3, E=6, S=[5,4,3,2,1,0]")
    print("=" * 60)
    d, S = 3, [5, 4, 3, 2, 1, 0]
    tau = sp.Symbol("tau"); rs = sp.symbols("r0:3"); us = sp.symbols("u0:3")

    # Original 2d x 2d block B, rows (D_t, M_t)
    B_rows = []
    for t in range(d):
        D_row, M_row = [], []
        for s in S:
            q = s // (2 ** t)
            ell = L(s % (2 ** t), us[:t]) if t > 0 else sp.Integer(1)
            M_row.append(sp.expand(ell * (-rs[t]) ** q))
            D_row.append(sp.expand(sp.Integer(0) if q == 0 else ell * (tau ** q - (-rs[t]) ** q)))
        B_rows.append(D_row); B_rows.append(M_row)
    B = sp.Matrix(B_rows)
    print(f"  rank(B) = {B.rank()}  (expected 2d-1 = {2 * d - 1})")

    # Adapted rows + triangularise
    rows, _ = adapted_rows(d, S, tau, rs, us)
    new_rows = triangularise(d, S, rows, us)
    Dtop = new_rows[2 * (d - 1)]; Ntop = new_rows[2 * (d - 1) + 1]

    j0 = next(j for j, v in enumerate(Dtop) if v != 0)
    lam = sp.cancel(Ntop[j0] / Dtop[j0])
    rm, um = rs[d - 2], us[d - 2]
    lam_exp = sp.cancel(-(um * (tau - rm) + (1 - um) * tau * rm) / (1 - um))
    print(f"  lambda match: {sp.simplify(lam - lam_exp) == 0}")
    glob = all(sp.simplify(Ntop[j] - lam * Dtop[j]) == 0 for j in range(len(S)))
    print(f"  N_2 = lambda * D_2' on full support: {glob}")

    print("  reduced 5x5 minors (delete N_2 row, vary deleted column):")
    red = new_rows[:2 * d - 1]
    for j, s in enumerate(S):
        sub = sp.Matrix([[red[i][k] for k in range(len(S)) if k != j] for i in range(len(red))])
        print(f"    del s={s:>2}: {sp.factor(sp.expand(sub.det()))}")


def verify_dense_rank_bound():
    """Prove rank(dense image) <= 2d-1 for E <= 3N/4 (SHPLEMINI_ZK_MASKING.md).

    The row identity N_{d-1}(s) = lambda * D_{d-1}'(s) is checked at EVERY
    monomial s in {0,...,N-1}; it holds for s < 3N/4 and fails for s >= 3N/4,
    which is exactly the E <= 3N/4 threshold. Then the dense 2d x E rank is
    checked numerically.
    """
    print("\n" + "=" * 60)
    print("Dense rank bound: N_{d-1} = lambda * D_{d-1}' per monomial (d=3,4)")
    print("=" * 60)
    for d in (3, 4):
        N = 2 ** d
        tau = sp.Symbol("tau"); rs = sp.symbols(f"r0:{d}"); us = sp.symbols(f"u0:{d}")
        S = list(range(N))  # all monomials 0..N-1
        rows, _ = adapted_rows(d, S, tau, rs, us)
        new_rows = triangularise(d, S, rows, us)
        Dtop = new_rows[2 * (d - 1)]; Ntop = new_rows[2 * (d - 1) + 1]
        rm, um = rs[d - 2], us[d - 2]
        lam = -(um * (tau - rm) + (1 - um) * tau * rm) / (1 - um)
        results = []
        for s in range(N):
            holds = sp.simplify(sp.cancel(Ntop[s] - lam * Dtop[s])) == 0
            results.append((s, holds))
        ok_below = all(h for s, h in results if s < 3 * N // 4)
        fail_above = all(not h for s, h in results if s >= 3 * N // 4)
        print(f"  d={d}, N={N}: identity holds for all s<3N/4: {ok_below}; "
              f"fails for all s>=3N/4: {fail_above}")

    print("\n  Dense 2d x E numerical rank (low-tail E <= 3N/4):")
    import random
    for d, E in [(3, 6), (4, 10), (4, 12), (5, 20), (5, 24)]:
        N = 2 ** d
        random.seed(7)
        tau_v = F(random.randint(2, 40))
        rs_v = [F(random.randint(2, 40)) for _ in range(d)]
        us_v = [F(random.randint(1, 9), random.randint(10, 25)) for _ in range(d)]
        B_rows = []
        for t in range(d):
            for kind in ('D', 'M'):
                row = []
                for s in range(E):
                    q = s // (2 ** t)
                    ell = L(s % (2 ** t), us_v[:t]) if t > 0 else F(1)
                    if kind == 'D':
                        row.append(F(0) if q == 0 else ell * (tau_v ** q - (-rs_v[t]) ** q))
                    else:
                        row.append(ell * (-rs_v[t]) ** q)
                B_rows.append(row)
        rk = sp.Matrix(B_rows).rank()
        print(f"    d={d}, N={N}, E={E:>2}: rank = {rk} (<= 2d-1 = {2 * d - 1})  "
              f"{'OK' if rk <= 2 * d - 1 else 'FAIL'}")


def _tail_support(d, E):
    """Tail-halving support for general even E: top pair {E-1,E-2} plus dyadic
    pairs {2^k,2^k-1}, deduped and padded with the lowest unused index."""
    S = [E - 1, E - 2]
    for k in range(d - 1, 0, -1):
        a, b = 2 ** k, 2 ** k - 1
        if a in S or b in S:
            continue
        S += [a, b]
    while len(S) < 2 * d:
        for s in range(E):
            if s not in S:
                S.append(s); break
    return sorted(set(S), reverse=True)[:2 * d]


def verify_high_tail_rho():
    """High-tail closed form (SHPLEMINI_ZK_MASKING.md Appendix A): for even
    disjoint E with 3N/4 < E <= N, det B_E equals
        eps * r0^2 tau^2 (tau^{E-4}-r0^{E-4}) prod(tau^2-r_k^2) (tau+r_{d-1})
              * A * L_hi,
    with L_hi using the rho-shifted final Lagrange index, rho=(E-1) mod 2^{d-2}.
    Ratio det/formula is checked constant (= eps) over random rational points.
    """
    print("\n" + "=" * 60)
    print("High-tail closed form (rho-shifted Lagrange) at d=4,5")
    print("=" * 60)
    import random

    def conj(d, E, tau, rs, us):
        h = 2 ** (d - 2); rho = (E - 1) % h; r0 = rs[0]
        v = r0 ** 2 * tau ** 2 * (tau ** (E - 4) - r0 ** (E - 4))
        for k in range(1, d - 1):
            v *= (tau ** 2 - rs[k] ** 2)
        v *= (tau + rs[d - 1])
        for k in range(d - 1):
            v *= (us[k] + (1 - us[k]) * rs[k]) * (us[k] - (1 - us[k]) * tau)
        Lhi = F(1)
        for k in range(1, d - 2):
            Lhi *= L(0, us[:k]) * L(2 ** k - 1, us[:k])
        Lhi *= L(0, us[:d - 2]) * L(rho, us[:d - 2])
        return v * Lhi

    for d, Es in [(4, [14, 16]), (5, [28, 30, 32])]:
        for E in Es:
            S = _tail_support(d, E)
            ratios = []
            for seed in (1, 2, 3):
                random.seed(seed)
                tau = F(random.randint(2, 60))
                rs = [F(random.randint(2, 60)) for _ in range(d)]
                us = [F(random.randint(1, 9), random.randint(10, 30)) for _ in range(d)]
                db = det_frac(original_rows_numeric(d, S, tau, rs, us))
                cj = conj(d, E, tau, rs, us)
                ratios.append(db / cj if cj != 0 else None)
            const = len(set(ratios)) == 1
            print(f"  d={d} E={E} rho={(E-1)%2**(d-2)}: ratio={ratios[0]}  "
                  f"{'OK (const)' if const else 'NONCONST ' + str(ratios)}")


def verify_low_tail_rho():
    """Low-tail reduced-minor closed form (Appendix B): delete row N_{d-1} and
    column N/2; the resulting minor equals
        eta * (r0 tau)^alpha_d (tau-r0) R_E prod(tau-r_k) prod A_k^+- * L_lo,
    alpha_d = 0 (d=3), 2 (d>=4), R_E=(tau^{E-4}-r0^{E-4})/(tau^2-r0^2).
    Ratio checked constant (= eta) over random points.
    """
    print("\n" + "=" * 60)
    print("Low-tail reduced-minor closed form (rho, alpha_d) at d=4,5")
    print("=" * 60)
    import random

    def alpha(d):
        return 0 if d == 3 else 2

    def conj(d, E, tau, rs, us):
        h = 2 ** (d - 2); rho = (E - 1) % h; r0 = rs[0]
        R = (tau ** (E - 4) - r0 ** (E - 4)) / (tau ** 2 - r0 ** 2)
        v = (r0 * tau) ** alpha(d) * (tau - r0) * R
        for k in range(1, d - 2):
            v *= (tau - rs[k])
        for k in range(d - 2):
            v *= (us[k] + (1 - us[k]) * rs[k]) * (us[k] - (1 - us[k]) * tau)
        Llo = (1 - us[d - 2]) * L(rho, us[:d - 2])
        for k in range(1, d - 2):
            Llo *= L(0, us[:k]) * L(2 ** k - 1, us[:k])
        return v * Llo

    for d, Es in [(4, [12]), (5, [20, 22, 24])]:
        N = 2 ** d
        for E in Es:
            S = _tail_support(d, E)
            cN = S.index(N // 2)
            ratios = []
            for seed in (1, 2, 3):
                random.seed(seed)
                tau = F(random.randint(2, 60))
                rs = [F(random.randint(2, 60)) for _ in range(d)]
                us = [F(random.randint(1, 9), random.randint(10, 30)) for _ in range(d)]
                rows = adapted_rows_numeric(d, S, tau, rs, us)
                # triangularise (Fraction): N_k = M_k^new - u_{k-1}D_{k-1}' - (1-u_{k-1})M_{k-1}^new
                new = [list(r) for r in rows]
                for k in range(1, d):
                    Mk, Dk, Mkm = 2 * k + 1, 2 * (k - 1), 2 * (k - 1) + 1
                    for c in range(len(S)):
                        new[Mk][c] = rows[Mk][c] - us[k - 1] * rows[Dk][c] - (1 - us[k - 1]) * rows[Mkm][c]
                keep = [r for i, r in enumerate(new) if i != 2 * d - 1]
                red = [[r[c] for c in range(len(S)) if c != cN] for r in keep]
                dl = det_frac(red)
                cj = conj(d, E, tau, rs, us)
                ratios.append(dl / cj if cj != 0 else None)
            const = len(set(ratios)) == 1
            print(f"  d={d} E={E} rho={(E-1)%2**(d-2)} alpha={alpha(d)}: ratio={ratios[0]}  "
                  f"{'OK (const)' if const else 'NONCONST ' + str(ratios)}")


def verify_boundary_port_decomposition():
    """Check the filtration-proof port: divide the full determinant/reduced minor
    by the already-proved middle-block product and compare only the boundary
    factor. This isolates the remaining non-dyadic boundary lemma in
    SHPLEMINI_ZK_MASKING.md Step 3C.
    """
    print("\n" + "=" * 60)
    print("Boundary-only decomposition after removing middle T_k blocks")
    print("=" * 60)
    import random

    def middle_prod(d, tau, rs, us):
        v = F(1)
        for k in range(1, d - 1):
            j = k - 1
            lag = L(0, us[:j]) * L(2 ** j - 1, us[:j]) if j > 0 else F(1)
            v *= -lag * (tau - rs[j]) * (us[j] + (1 - us[j]) * rs[j]) * (us[j] - (1 - us[j]) * tau)
        return v

    def boundary_hi(d, E, tau, rs, us):
        rho = (E - 1) % (2 ** (d - 2))
        r0 = rs[0]
        R = (tau ** (E - 4) - r0 ** (E - 4)) / (tau ** 2 - r0 ** 2)
        return (r0 ** 2 * tau ** 2 * R * (tau - rs[d - 2])
                * (us[d - 2] + (1 - us[d - 2]) * rs[d - 2])
                * (us[d - 2] - (1 - us[d - 2]) * tau)
                * L(0, us[:d - 2]) * L(rho, us[:d - 2]))

    def boundary_lo(d, E, tau, rs, us):
        rho = (E - 1) % (2 ** (d - 2))
        r0 = rs[0]
        alpha = 0 if d == 3 else 2
        R = (tau ** (E - 4) - r0 ** (E - 4)) / (tau ** 2 - r0 ** 2)
        return (r0 * tau) ** alpha * R * (1 - us[d - 2]) * L(rho, us[:d - 2])

    for d, Es in [(4, [14, 16]), (5, [28, 30, 32])]:
        for E in Es:
            S = _tail_support(d, E)
            ratios = []
            for seed in (1, 2, 3):
                random.seed(seed)
                tau = F(random.randint(2, 60))
                rs = [F(random.randint(2, 60)) for _ in range(d)]
                us = [F(random.randint(1, 9), random.randint(10, 30)) for _ in range(d)]
                det_tilde = det_frac(adapted_rows_numeric(d, S, tau, rs, us))
                bd = det_tilde / middle_prod(d, tau, rs, us)
                ratios.append(bd / boundary_hi(d, E, tau, rs, us))
            print(f"  HIGH d={d} E={E}: boundary ratio={ratios[0]}  "
                  f"{'OK (const)' if len(set(ratios)) == 1 else 'NONCONST ' + str(ratios)}")

    for d, Es in [(4, [12]), (5, [20, 22, 24])]:
        N = 2 ** d
        for E in Es:
            S = _tail_support(d, E)
            cN = S.index(N // 2)
            ratios = []
            for seed in (1, 2, 3):
                random.seed(seed)
                tau = F(random.randint(2, 60))
                rs = [F(random.randint(2, 60)) for _ in range(d)]
                us = [F(random.randint(1, 9), random.randint(10, 30)) for _ in range(d)]
                rows = adapted_rows_numeric(d, S, tau, rs, us)
                new = [list(r) for r in rows]
                for k in range(1, d):
                    Mk, Dk, Mkm = 2 * k + 1, 2 * (k - 1), 2 * (k - 1) + 1
                    for c in range(len(S)):
                        new[Mk][c] = rows[Mk][c] - us[k - 1] * rows[Dk][c] - (1 - us[k - 1]) * rows[Mkm][c]
                keep = [r for i, r in enumerate(new) if i != 2 * d - 1]
                red = [[r[c] for c in range(len(S)) if c != cN] for r in keep]
                det_red = det_frac(red)
                bd = det_red / middle_prod(d, tau, rs, us)
                ratios.append(bd / boundary_lo(d, E, tau, rs, us))
            print(f"  LOW  d={d} E={E}: boundary ratio={ratios[0]}  "
                  f"{'OK (const)' if len(set(ratios)) == 1 else 'NONCONST ' + str(ratios)}")


if __name__ == "__main__":
    verify_d3_symbolic()
    verify_d4_symbolic_structure()
    verify_d4_numeric_det()
    verify_lemma5()
    verify_low_tail_d3()
    verify_dense_rank_bound()
    verify_high_tail_rho()
    verify_low_tail_rho()
    verify_boundary_port_decomposition()
