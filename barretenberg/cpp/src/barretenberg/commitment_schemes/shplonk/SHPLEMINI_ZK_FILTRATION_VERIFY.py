"""
Symbolic and numerical verification for SHPLEMINI_ZK_FILTRATION_PROOF.md.

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
    M_k^new = M_k + r_k * D_k'  (Step B from SHPLEMINI_ZK_FILTRATION_PROOF.md §0).
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
                Dp = sum(tau ** (q - 1 - j) * (-rs[t]) ** j for j in range(q))
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


if __name__ == "__main__":
    verify_d3_symbolic()
    verify_d4_symbolic_structure()
    verify_d4_numeric_det()
    verify_lemma5()
