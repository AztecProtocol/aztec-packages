// Derived parameters for the K=4 "quad" compressed Poseidon2 internal-round encoding on BN254.
// Treated like the base Poseidon2 constants: fixed, derivable from the sponge spec, pre-computed.
//
// See `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/README.md` for the algebraic
// derivation. The short version:
//
//   The compressed K=4 row stores state[0] at 4 consecutive internal rounds. Solving for the
//   non-S-boxed elements (s_1, s_2, s_3) at row-start reduces (via row-reduction) to a 3x3
//   Vandermonde system with nodes (D_2, D_3, D_4). Its Lagrange-basis inverse has 9 fixed
//   coefficients α_j^(k) that let us write s_j = Σ_k α_j^(k) b_k where b_k are linear in wires.
//
// This file exposes those 9 coefficients, the derived diagonal constants used by the entry
// relation, and the closed-form propagation tables consumed by the quad relations.
//
// Static assertions guard invertibility: the three Vandermonde differences (D_3 - D_2),
// (D_4 - D_2), (D_4 - D_3) must all be nonzero.

#pragma once

#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <array>
#include <cstddef>

namespace bb::crypto {

struct Poseidon2QuadBn254Params {
    using FF = Poseidon2Bn254ScalarFieldParams::FF;
    static constexpr size_t VANDERMONDE_SIZE = Poseidon2Bn254ScalarFieldParams::t - 1;

    // Internal matrix diagonal D_i (computed from the stored `D_i - 1` values).
    static constexpr FF D1 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr FF D2 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr FF D3 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr FF D4 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];

    static constexpr FF SIGMA = D2 + D3 + D4; // Σ = D_2 + D_3 + D_4, recurs in the relation algebra

  private:
    // Vandermonde differences (used below and also asserted non-zero).
    static constexpr FF D2_minus_D3 = D2 - D3;
    static constexpr FF D2_minus_D4 = D2 - D4;
    static constexpr FF D3_minus_D4 = D3 - D4;

    // 1 / ((D_2 - D_3)(D_2 - D_4)) — denominator for α_1^(·)
    static constexpr FF inv_denom_1 = (D2_minus_D3 * D2_minus_D4).invert();
    // 1 / ((D_3 - D_2)(D_3 - D_4)) — denominator for α_2^(·)
    static constexpr FF inv_denom_2 = ((-D2_minus_D3) * D3_minus_D4).invert();
    // 1 / ((D_4 - D_2)(D_4 - D_3)) — denominator for α_3^(·)
    static constexpr FF inv_denom_3 = ((-D2_minus_D4) * (-D3_minus_D4)).invert();

    // Invertibility guard. det(V) = (D_3 - D_2)(D_4 - D_2)(D_4 - D_3).
    static_assert(!D2_minus_D3.is_zero(), "Poseidon2 quad: D_2 == D_3, Vandermonde singular");
    static_assert(!D2_minus_D4.is_zero(), "Poseidon2 quad: D_2 == D_4, Vandermonde singular");
    static_assert(!D3_minus_D4.is_zero(), "Poseidon2 quad: D_3 == D_4, Vandermonde singular");

  public:
    // Lagrange basis coefficients α_j^(k).
    //
    //   s_j = α_j^(1) * b_1 + α_j^(2) * b_2 + α_j^(3) * b_3
    //
    // where b_k is the k-th right-hand side of the row-reduced Vandermonde system. These are
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
    // α_j^(1): constant term of L_j.
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
    // Equivalence to the step iteration is verified in a unit test (see `poseidon2_quad_closed_form.test.cpp`).
    //
    // Linear round-propagation vectors  (A^k · 1)_j  for k = 1, 2.
    //
    // Used by both the entry relation (which checks state[0] at rounds 1, 2 from a standard
    // encoded predecessor) and the closed-form table builder below. These simple scalar formulas
    // remain constexpr.
    //
    //   A_one[j]  = (A · 1)_j   = D_{j+1} + 2
    //   A2_one[j] = (A^2 · 1)_j = D_{j+1}^2 + D_{j+1} + Σ + 4
    //   sum_A_one = 1^T A · 1   = Σ + 6  (also = (A · 1) summed over rows)
    static constexpr std::array<FF, VANDERMONDE_SIZE> A_one = { D2 + FF(2), D3 + FF(2), D4 + FF(2) };
    static constexpr std::array<FF, VANDERMONDE_SIZE> A2_one = {
        D2 * D2 + D2 + SIGMA + FF(4),
        D3* D3 + D3 + SIGMA + FF(4),
        D4* D4 + D4 + SIGMA + FF(4),
    };
    static constexpr FF sum_A_one = SIGMA + FF(6);

    // Closed-form coefficient table layout. Each row gives coefficients for the inputs
    //   (w_r, w_o, w_4, u_0, u_1, u_2, u_3),
    // where u_k = (s_0^{(k)} + c_k)^5.
    //
    //   closed_form[j] for j in {0,1,2,3}: coefficients of out_j, i.e. state[j] after four
    //                                      internal rounds. The terminal relation consumes all
    //                                      four rows; the interior relation consumes row 0.
    //
    //   forward_vandermonde_lhs[k] for k in {0,1,2}: coefficients of the forward-Vandermonde
    //                                                combinations used by the interior relation:
    //                                                row 0 = out_1 + out_2 + out_3
    //                                                row 1 = D_2 out_1 + D_3 out_2 + D_4 out_3
    //                                                row 2 = D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3
    enum ClosedFormColumn : size_t {
        W_R,
        W_O,
        W_4,
        U_0,
        U_1,
        U_2,
        U_3,
    };
    enum ClosedFormOutput : size_t {
        OUT_0,
        OUT_1,
        OUT_2,
        OUT_3,
    };
    static constexpr size_t CLOSED_FORM_INPUT_COUNT = VANDERMONDE_SIZE + Poseidon2Bn254ScalarFieldParams::t;
    static_assert(CLOSED_FORM_INPUT_COUNT == U_3 + 1);
    using ClosedFormRow = std::array<FF, CLOSED_FORM_INPUT_COUNT>;
    using ClosedFormTable = std::array<ClosedFormRow, 4>;
    using ForwardVandermondeTable = std::array<ClosedFormRow, VANDERMONDE_SIZE>;

  private:
    // Derive the coefficient tables once from the fixed Poseidon2 parameters. The relation code
    // reads only the resulting `closed_form` and `forward_vandermonde_lhs` tables.
    struct Tables {
        ClosedFormTable closed_form;
        ForwardVandermondeTable forward_vandermonde_lhs;
    };

    using Mat = std::array<std::array<FF, VANDERMONDE_SIZE>, VANDERMONDE_SIZE>;
    using Vec = std::array<FF, VANDERMONDE_SIZE>;

    static constexpr Mat matrix_multiply(const Mat& a, const Mat& b)
    {
        Mat r{};
        for (size_t i = 0; i < VANDERMONDE_SIZE; ++i) {
            for (size_t j = 0; j < VANDERMONDE_SIZE; ++j) {
                FF s = FF(0);
                for (size_t k = 0; k < VANDERMONDE_SIZE; ++k) {
                    s += a[i][k] * b[k][j];
                }
                r[i][j] = s;
            }
        }
        return r;
    }

    static constexpr Vec matrix_vector_multiply(const Mat& a, const Vec& v)
    {
        Vec r{};
        for (size_t i = 0; i < VANDERMONDE_SIZE; ++i) {
            FF s = FF(0);
            for (size_t k = 0; k < VANDERMONDE_SIZE; ++k) {
                s += a[i][k] * v[k];
            }
            r[i] = s;
        }
        return r;
    }

    static constexpr Vec vector_matrix_multiply(const Vec& v, const Mat& a)
    {
        Vec r{};
        for (size_t j = 0; j < VANDERMONDE_SIZE; ++j) {
            FF s = FF(0);
            for (size_t k = 0; k < VANDERMONDE_SIZE; ++k) {
                s += v[k] * a[k][j];
            }
            r[j] = s;
        }
        return r;
    }

    static constexpr FF vector_sum(const Vec& v)
    {
        FF result = FF(0);
        for (const auto& entry : v) {
            result += entry;
        }
        return result;
    }

    static constexpr ClosedFormRow weighted_closed_form_sum(const Vec& weights, const ClosedFormTable& table)
    {
        ClosedFormRow r{};
        for (size_t i = 0; i < CLOSED_FORM_INPUT_COUNT; ++i) {
            r[i] = weights[0] * table[OUT_1][i] + weights[1] * table[OUT_2][i] + weights[2] * table[OUT_3][i];
        }
        return r;
    }

    static Tables build_tables()
    {
        const Vec ones = { FF(1), FF(1), FF(1) };
        // A: internal-round update on (s_1, s_2, s_3). step(v, u) = A v + u·1.
        const Mat A = { { { D2, FF(1), FF(1) }, { FF(1), D3, FF(1) }, { FF(1), FF(1), D4 } } };
        const Mat A2 = matrix_multiply(A, A);
        const Mat A3 = matrix_multiply(A2, A);
        const Mat A4 = matrix_multiply(A3, A);
        const Vec A_one = matrix_vector_multiply(A, ones);
        const Vec A2_one = matrix_vector_multiply(A2, ones);
        const Vec A3_one = matrix_vector_multiply(A3, ones);

        // V_inv (rows are Lagrange coefs α_j^(*)).
        const Mat Vinv = { { { alpha_1_1, alpha_1_2, alpha_1_3 },
                             { alpha_2_1, alpha_2_2, alpha_2_3 },
                             { alpha_3_1, alpha_3_2, alpha_3_3 } } };
        // M = A^4 · V_inv: maps b → b-derived part of out_{1,2,3} at round 4.
        const Mat M = matrix_multiply(A4, Vinv);

        // B_w: rows are w-coefs of b_1, b_2, b_3 on (w_r, w_o, w_4).
        const Mat Bw = { { { FF(1), FF(0), FF(0) }, { -FF(2), FF(1), FF(0) }, { -(SIGMA + FF(2)), -FF(1), FF(1) } } };
        // B_u: rows are (u_0, u_1, u_2)-coefs of b_1, b_2, b_3.
        const Mat Bu = { { { -D1, FF(0), FF(0) },
                           { FF(2) * D1 - FF(3), -D1, FF(0) },
                           { (SIGMA + FF(2)) * D1 - SIGMA - FF(3), D1 - FF(3), -D1 } } };

        const Mat Mw = matrix_multiply(M, Bw);  // w-coefs of out_{1,2,3}
        const Mat MBu = matrix_multiply(M, Bu); // b-derived part of u-coefs

        // T_3 = sum of state[1..3] at round 3.
        // q_T3 = (1^T A^3) · V_inv: projection coefficients for the b-derived part of T_3.
        const Vec col_sum_A3 = vector_matrix_multiply(ones, A3);
        const Vec q_T3 = vector_matrix_multiply(col_sum_A3, Vinv);
        const FF sum_A_one = vector_sum(A_one);
        const FF sum_A2_one = vector_sum(A2_one);

        const Vec row0_wire_coefficients = vector_matrix_multiply(q_T3, Bw);
        const Vec row0_u_coefficients = vector_matrix_multiply(q_T3, Bu);

        // out_0 = D_1 u_3 + T_3.
        // T_3's wire-coefs:  q_T3 · B_w  (1×3 · 3×3 → 1×3)
        // T_3's u-coefs:     q_T3 · B_u  + (sum_A2_one, sum_A_one, 3) inhomogeneous additions
        ClosedFormRow row0{};
        for (size_t i = 0; i < VANDERMONDE_SIZE; ++i) {
            row0[i] = row0_wire_coefficients[i];
        }
        row0[U_0] = row0_u_coefficients[0] + sum_A2_one;
        row0[U_1] = row0_u_coefficients[1] + sum_A_one;
        row0[U_2] = row0_u_coefficients[2] + FF(3);
        row0[U_3] = D1;

        // out_j (j=1,2,3): u_3 coefficient is identically 1 (free add at use site).
        auto build_out_j = [&](size_t j) {
            ClosedFormRow r{};
            r[W_R] = Mw[j][0];
            r[W_O] = Mw[j][1];
            r[W_4] = Mw[j][2];
            r[U_0] = MBu[j][0] + A3_one[j];
            r[U_1] = MBu[j][1] + A2_one[j];
            r[U_2] = MBu[j][2] + A_one[j];
            r[U_3] = FF(1);
            return r;
        };

        ClosedFormTable closed_form_table{ row0, build_out_j(0), build_out_j(1), build_out_j(2) };

        // Forward-Vandermonde LHS rows: linear combinations across out_{1,2,3} weighted by
        //   row 0: (1, 1, 1)              → out_1 + out_2 + out_3
        //   row 1: (D_2, D_3, D_4)        → D_2 out_1 + D_3 out_2 + D_4 out_3
        //   row 2: (D_2², D_3², D_4²)     → D_2² out_1 + D_3² out_2 + D_4² out_3
        // Each row's coefficients on (w_*, u_*) are obtained by the same weighted sum applied
        // to the corresponding (w_*, u_*) coefficients of out_1..out_3.
        const std::array<Vec, VANDERMONDE_SIZE> lhs_weights = {
            { { FF(1), FF(1), FF(1) }, { D2, D3, D4 }, { D2 * D2, D3 * D3, D4 * D4 } }
        };
        ForwardVandermondeTable lhs_table{};
        for (size_t k = 0; k < VANDERMONDE_SIZE; ++k) {
            lhs_table[k] = weighted_closed_form_sum(lhs_weights[k], closed_form_table);
        }

        return Tables{ closed_form_table, lhs_table };
    }

  public:
    // Public coefficient tables consumed by the relations.
    static inline const Tables tables = build_tables();
};

} // namespace bb::crypto
