// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

// Derived parameters for the K=4 "quad" compressed Poseidon2 internal-round encoding on BN254.
// Treated like the base Poseidon2 constants: fixed, derivable from the sponge spec, pre-computed.
//
// See `barretenberg/cpp/src/barretenberg/relations/poseidon2_quad_internal_round.md` for the
// algebraic derivation. The short version:
//
//   The compressed K=4 row stores state[0] at 4 consecutive internal rounds. Solving for the
//   non-S-boxed elements (s_1, s_2, s_3) at row-start reduces (via row-reduction) to a 3x3
//   Vandermonde system with nodes (D_2, D_3, D_4). Its Lagrange-basis inverse has 9 fixed
//   coefficients α_j^(k) that let us write s_j = Σ_k α_j^(k) b_k where b_k are linear in wires.
//
// This file exposes those 9 coefficients as constexpr members of `Poseidon2QuadBn254Params`,
// plus helper derived constants used by the relation (e.g. D_i, Σ = D_2 + D_3 + D_4).
//
// `static_assert`s at the bottom guard invertibility: the three Vandermonde differences
// (D_3 - D_2), (D_4 - D_2), (D_4 - D_3) must all be nonzero. For the published BN254 Poseidon2
// parameters these are distinct 256-bit values, so the assertion holds.

#pragma once

#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <array>
#include <cstddef>

namespace bb::crypto {

struct Poseidon2QuadBn254Params {
    using FF = Poseidon2Bn254ScalarFieldParams::FF;

    // ------------------------------------------------------------
    // Internal matrix diagonal D_i (computed from the stored `D_i - 1` values).
    // ------------------------------------------------------------
    static constexpr FF D1 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr FF D2 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr FF D3 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr FF D4 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];

    static constexpr FF SIGMA = D2 + D3 + D4; // Σ = D_2 + D_3 + D_4, recurs in the relation algebra

    // ------------------------------------------------------------
    // Vandermonde differences (used below and also asserted non-zero).
    // ------------------------------------------------------------
    static constexpr FF D2_minus_D3 = D2 - D3;
    static constexpr FF D2_minus_D4 = D2 - D4;
    static constexpr FF D3_minus_D4 = D3 - D4;

    // ------------------------------------------------------------
    // Lagrange basis coefficients α_j^(k).
    //
    //   s_j = α_j^(1) * b_1 + α_j^(2) * b_2 + α_j^(3) * b_3
    //
    // where b_k is the k-th right-hand side of the row-reduced Vandermonde system. The coefs are
    // the coefficients of the Lagrange polynomial at node D_{j+1} (taking nodes (D_2, D_3, D_4)):
    //
    //   L_j(x) = α_j^(1) + α_j^(2) * x + α_j^(3) * x^2
    //          = Π_{k ≠ j} (x - D_{k+1}) / (D_{j+1} - D_{k+1})
    //
    // Concretely:
    //   α_1^(1) =  D_3 * D_4     / ((D_2 - D_3)(D_2 - D_4))
    //   α_1^(2) = -(D_3 + D_4)   / ((D_2 - D_3)(D_2 - D_4))
    //   α_1^(3) =  1             / ((D_2 - D_3)(D_2 - D_4))
    //   (and analogously for α_2^(k), α_3^(k))
    // ------------------------------------------------------------

    // 1 / ((D_2 - D_3)(D_2 - D_4)) — denominator for α_1^(·)
    static constexpr FF inv_denom_1 = (D2_minus_D3 * D2_minus_D4).invert();
    // 1 / ((D_3 - D_2)(D_3 - D_4)) — denominator for α_2^(·)
    static constexpr FF inv_denom_2 = ((-D2_minus_D3) * D3_minus_D4).invert();
    // 1 / ((D_4 - D_2)(D_4 - D_3)) — denominator for α_3^(·)
    static constexpr FF inv_denom_3 = ((-D2_minus_D4) * (-D3_minus_D4)).invert();

    // α_j^(1): constant term of L_j (= 1 / D_{j+1}-node product)
    static constexpr FF alpha_1_1 = D3 * D4 * inv_denom_1;
    static constexpr FF alpha_2_1 = D2 * D4 * inv_denom_2;
    static constexpr FF alpha_3_1 = D2 * D3 * inv_denom_3;

    // α_j^(2): linear term (negated sum of other nodes, divided by the denominator)
    static constexpr FF alpha_1_2 = -(D3 + D4) * inv_denom_1;
    static constexpr FF alpha_2_2 = -(D2 + D4) * inv_denom_2;
    static constexpr FF alpha_3_2 = -(D2 + D3) * inv_denom_3;

    // α_j^(3): quadratic term (pure reciprocal of the denominator)
    static constexpr FF alpha_1_3 = inv_denom_1;
    static constexpr FF alpha_2_3 = inv_denom_2;
    static constexpr FF alpha_3_3 = inv_denom_3;

    // ------------------------------------------------------------
    // Invertibility guard. det(V) = (D_3 - D_2)(D_4 - D_2)(D_4 - D_3).
    // ------------------------------------------------------------
    static_assert(!D2_minus_D3.is_zero(), "Poseidon2 quad: D_2 == D_3, Vandermonde singular");
    static_assert(!D2_minus_D4.is_zero(), "Poseidon2 quad: D_2 == D_4, Vandermonde singular");
    static_assert(!D3_minus_D4.is_zero(), "Poseidon2 quad: D_3 == D_4, Vandermonde singular");

    // ============================================================
    // Closed-form 4-round propagation coefficients.
    //
    // The four-round internal-block update on the non-S-boxed lanes (s_1, s_2, s_3) is linear
    // once the four S-boxed scalars u_k = (w_k + c_k)^5 are taken as opaque inputs:
    //
    //   step(v, u) = A v + u · 1,    A = [[D_2,1,1],[1,D_3,1],[1,1,D_4]]
    //
    // After 4 rounds with inputs u_0..u_3, the state-at-round-4 components (out_1, out_2, out_3)
    // and the state-at-round-3 row-sum T_3 (used by out_0 = D_1 u_3 + T_3) are all fixed linear
    // combinations of (w_r, w_o, w_4, u_0, u_1, u_2, u_3), where the (w_r, w_o, w_4)-dependence
    // enters through  s^{(0)} = V^{-1} b  and  b_k = linear(w_*, u_0..u_2). Composing  A^4 V^{-1}
    // with the b_k formulas gives the 28 constants below, one per (output, input) cell.
    //
    // Cost side: at sumcheck time these coefficients let us bypass the ~37-mul Vandermonde-RHS
    // construction, the ~63-mul Lagrange solve, and the ~84-mul step iteration — replacing all
    // three with one Acc×Fr per (u_k, out_j) entry and one CoeffAcc×Fr per (w_*, out_j) entry.
    //
    // Equivalence to the step iteration is verified at unit-test time
    // (see `poseidon2_quad_closed_form.test.cpp`).
    // ------------------------------------------------------------
  public:
    // -----------------------------------------------------------
    // Linear round-propagation vectors  (A^k · 1)_j  for k = 1, 2.
    //
    // Used by both the entry relation (which checks state[0] at rounds 1, 2 from a standard
    // encoded predecessor) and the closed-form table builder below. Closed-form scalars, so
    // these survive constexpr.
    //
    //   A_one[j]  = (A · 1)_j   = D_{j+1} + 2
    //   A2_one[j] = (A^2 · 1)_j = D_{j+1}^2 + D_{j+1} + Σ + 4
    //   sum_A_one = 1^T A · 1   = Σ + 6  (also = (A · 1) summed over rows)
    // -----------------------------------------------------------
    static constexpr std::array<FF, 3> A_one = { D2 + FF(2), D3 + FF(2), D4 + FF(2) };
    static constexpr std::array<FF, 3> A2_one = { D2 * D2 + D2 + SIGMA + FF(4),
                                                  D3* D3 + D3 + SIGMA + FF(4),
                                                  D4* D4 + D4 + SIGMA + FF(4) };
    static constexpr FF sum_A_one = SIGMA + FF(6);

    // Storage for the closed-form coefficient tables. Each row is laid out as
    //   (c_wr, c_wo, c_w4, c_u0, c_u1, c_u2, c_u3),
    // so the relation body evaluates  Σ_i c_i · input_i  with one Acc×Fr per u-term and one
    // CoeffAcc×Fr per wire-term.
    //
    //   `closed_form[j]` for j ∈ {0,1,2,3}  : coefficients of `out_j` (state[j] at round 4).
    //                                         Used by the terminal relation (direct match against
    //                                         standard-encoded successor) and by A_0 in the
    //                                         interior relation.
    //   `forward_vandermonde_lhs[k]` for k ∈ {0,1,2}  : coefficients of the k-th forward-Vandermonde
    //                                                  LHS used in interior subrelations A_{k+1}.
    //                                                  Row 0 = out_1 + out_2 + out_3
    //                                                  Row 1 = D_2 out_1 + D_3 out_2 + D_4 out_3
    //                                                  Row 2 = D_2² out_1 + D_3² out_2 + D_4² out_3
    //
    // The interior relation uses `closed_form[0]` for A_0 and the three `forward_vandermonde_lhs`
    // rows for A_1, A_2, A_3 — it never materialises out_1, out_2, out_3 individually.
    using ClosedFormRow = std::array<FF, 7>;
    using ClosedFormTable = std::array<ClosedFormRow, 4>;
    using ForwardVandermondeTable = std::array<ClosedFormRow, 3>;

  private:
    // One-shot derivation at static-init time. `fr` arithmetic isn't deeply constexpr-capable
    // (matrix loops over 3x3 don't survive `constexpr_var_requires_const_init`), so tables
    // are built once at program start instead.
    //
    // The hot path (sumcheck relation `accumulate`) reads only `closed_form` and
    // `forward_vandermonde_lhs` below — `static inline const` arrays at class scope are
    // zero-init then constructor-init exactly once before main(), with no per-access guard
    // (unlike function-local statics).
    struct Tables {
        ClosedFormTable closed_form;
        ForwardVandermondeTable forward_vandermonde_lhs;
    };

    static Tables build_tables()
    {
        using Mat3 = std::array<std::array<FF, 3>, 3>;
        using Vec3 = std::array<FF, 3>;

        auto mm = [](const Mat3& a, const Mat3& b) {
            Mat3 r{};
            for (size_t i = 0; i < 3; ++i) {
                for (size_t j = 0; j < 3; ++j) {
                    FF s = FF(0);
                    for (size_t k = 0; k < 3; ++k) {
                        s += a[i][k] * b[k][j];
                    }
                    r[i][j] = s;
                }
            }
            return r;
        };
        auto mv = [](const Mat3& a, const Vec3& v) {
            Vec3 r{};
            for (size_t i = 0; i < 3; ++i) {
                FF s = FF(0);
                for (size_t k = 0; k < 3; ++k) {
                    s += a[i][k] * v[k];
                }
                r[i] = s;
            }
            return r;
        };

        const Vec3 ones = { FF(1), FF(1), FF(1) };
        // A: internal-round update on (s_1, s_2, s_3). step(v, u) = A v + u·1.
        const Mat3 A = { { { D2, FF(1), FF(1) }, { FF(1), D3, FF(1) }, { FF(1), FF(1), D4 } } };
        const Mat3 A2 = mm(A, A);
        const Mat3 A3 = mm(A2, A);
        const Mat3 A4 = mm(A3, A);
        const Vec3 A_one = mv(A, ones);
        const Vec3 A2_one = mv(A2, ones);
        const Vec3 A3_one = mv(A3, ones);

        // V_inv (rows are Lagrange coefs α_j^(*)).
        const Mat3 Vinv = { { { alpha_1_1, alpha_1_2, alpha_1_3 },
                              { alpha_2_1, alpha_2_2, alpha_2_3 },
                              { alpha_3_1, alpha_3_2, alpha_3_3 } } };
        // M = A^4 · V_inv: maps b → b-derived part of out_{1,2,3} at round 4.
        const Mat3 M = mm(A4, Vinv);

        // B_w: rows are w-coefs of b_1, b_2, b_3 on (w_r, w_o, w_4).
        const Mat3 Bw = { { { FF(1), FF(0), FF(0) }, { -FF(2), FF(1), FF(0) }, { -(SIGMA + FF(2)), -FF(1), FF(1) } } };
        // B_u: rows are (u_0, u_1, u_2)-coefs of b_1, b_2, b_3.
        const Mat3 Bu = { { { -D1, FF(0), FF(0) },
                            { FF(2) * D1 - FF(3), -D1, FF(0) },
                            { (SIGMA + FF(2)) * D1 - SIGMA - FF(3), D1 - FF(3), -D1 } } };

        const Mat3 Mw = mm(M, Bw);  // w-coefs of out_{1,2,3}
        const Mat3 MBu = mm(M, Bu); // b-derived part of u-coefs

        // T_3 = sum of state[1..3] at round 3.
        // q_T3 = (1^T A^3) · V_inv: projection coefficients for the b-derived part of T_3.
        const Vec3 col_sum_A3 = { A3[0][0] + A3[1][0] + A3[2][0],
                                  A3[0][1] + A3[1][1] + A3[2][1],
                                  A3[0][2] + A3[1][2] + A3[2][2] };
        Vec3 q_T3{};
        for (size_t i = 0; i < 3; ++i) {
            q_T3[i] = col_sum_A3[0] * Vinv[0][i] + col_sum_A3[1] * Vinv[1][i] + col_sum_A3[2] * Vinv[2][i];
        }
        const FF sum_A_one = A_one[0] + A_one[1] + A_one[2];
        const FF sum_A2_one = A2_one[0] + A2_one[1] + A2_one[2];

        // out_0 = D_1 u_3 + T_3.
        // T_3's wire-coefs:  q_T3 · B_w  (1×3 · 3×3 → 1×3)
        // T_3's u-coefs:     q_T3 · B_u  + (sum_A2_one, sum_A_one, 3) inhomogeneous additions
        ClosedFormRow row0{};
        for (size_t i = 0; i < 3; ++i) {
            row0[i] = q_T3[0] * Bw[0][i] + q_T3[1] * Bw[1][i] + q_T3[2] * Bw[2][i]; // c_wr, c_wo, c_w4
        }
        row0[3] = (q_T3[0] * Bu[0][0] + q_T3[1] * Bu[1][0] + q_T3[2] * Bu[2][0]) + sum_A2_one; // c_u0
        row0[4] = (q_T3[0] * Bu[0][1] + q_T3[1] * Bu[1][1] + q_T3[2] * Bu[2][1]) + sum_A_one;  // c_u1
        row0[5] = (q_T3[0] * Bu[0][2] + q_T3[1] * Bu[1][2] + q_T3[2] * Bu[2][2]) + FF(3);      // c_u2
        row0[6] = D1;                                                                          // c_u3 = D_1

        // out_j (j=1,2,3): u_3 coefficient is identically 1 (free add at use site).
        auto build_out_j = [&](size_t j) {
            ClosedFormRow r{};
            r[0] = Mw[j][0];
            r[1] = Mw[j][1];
            r[2] = Mw[j][2];
            r[3] = MBu[j][0] + A3_one[j];
            r[4] = MBu[j][1] + A2_one[j];
            r[5] = MBu[j][2] + A_one[j];
            r[6] = FF(1);
            return r;
        };

        ClosedFormTable closed_form_table{ row0, build_out_j(0), build_out_j(1), build_out_j(2) };

        // Forward-Vandermonde LHS rows: linear combinations across out_{1,2,3} weighted by
        //   row 0: (1, 1, 1)              → out_1 + out_2 + out_3
        //   row 1: (D_2, D_3, D_4)        → D_2 out_1 + D_3 out_2 + D_4 out_3
        //   row 2: (D_2², D_3², D_4²)     → D_2² out_1 + D_3² out_2 + D_4² out_3
        // Each row's coefficients on (w_*, u_*) are obtained by the same weighted sum applied
        // to the corresponding (w_*, u_*) coefficients of out_1..out_3.
        const std::array<Vec3, 3> lhs_weights = {
            { { FF(1), FF(1), FF(1) }, { D2, D3, D4 }, { D2 * D2, D3 * D3, D4 * D4 } }
        };
        ForwardVandermondeTable lhs_table{};
        for (size_t k = 0; k < 3; ++k) {
            const Vec3& w = lhs_weights[k];
            ClosedFormRow& r = lhs_table[k];
            for (size_t i = 0; i < 7; ++i) {
                r[i] = w[0] * closed_form_table[1][i] + w[1] * closed_form_table[2][i] + w[2] * closed_form_table[3][i];
            }
        }

        return Tables{ closed_form_table, lhs_table };
    }

  public:
    // -----------------------------------------------------------
    // Public coefficient tables consumed by the relations.
    //
    // `tables` is a single static-inline-const aggregate whose fields are read directly via
    // `QuadParams::tables.closed_form[...]` / `QuadParams::tables.forward_vandermonde_lhs[...]`.
    // Because the symbol address is fixed at link time and the field offsets are compile-time
    // constants, the hot path emits a plain mov from a known address — no pointer chase, no
    // atomic guard, no per-call construction. `build_tables()` runs exactly once before main().
    // -----------------------------------------------------------
    static inline const Tables tables = build_tables();
};

} // namespace bb::crypto
