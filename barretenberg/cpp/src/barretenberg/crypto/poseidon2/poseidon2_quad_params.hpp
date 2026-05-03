#pragma once

#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <array>
#include <cstddef>

namespace bb::crypto {

/**
 * @brief Constants for the K-compressed Poseidon2 internal-round relations (K=4 / K=8).
 *
 * @details The internal-round matrix `M_I` is diagonal-plus-ones with diagonal entries D_1..D_4.
 * Within a compressed row encoding s_0 at K consecutive internal rounds, the non-S-boxed state
 * cells (s_1, s_2, s_3) at row-start are derived from a 3x3 Vandermonde system with nodes
 * (D_2, D_3, D_4):
 *
 *     V = [[1, 1, 1], [D_2, D_3, D_4], [D_2^2, D_3^2, D_4^2]]
 *     V . (s_1, s_2, s_3)^T = (b_1, b_2, b_3)^T
 *
 * The inverse V^{-1} has rows (Lagrange coefficients) `alpha_j^(k)` so that
 *     s_j = alpha_j^(1) * b_1 + alpha_j^(2) * b_2 + alpha_j^(3) * b_3.
 *
 * Standard Vandermonde inverse for nodes (a, b, c):
 *     row 1 = (b*c, -(b+c), 1) / [(a-b)(a-c)]
 *     row 2 = (a*c, -(a+c), 1) / [(b-a)(b-c)]
 *     row 3 = (a*b, -(a+b), 1) / [(c-a)(c-b)]
 *
 * All values are computed at compile time from the canonical Poseidon2 BN254 parameters.
 */
struct Poseidon2QuadBn254Params {

    using FF = bb::fr;

    // Diagonal entries of the internal-round matrix M_I.
    static constexpr FF D1 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr FF D2 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr FF D3 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr FF D4 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];

    // Sigma = D_2 + D_3 + D_4 (the trace of the non-S-boxed diagonal block).
    static constexpr FF SIGMA = D2 + D3 + D4;

    // Inverse-row denominators for the 3x3 Vandermonde solve with nodes (D_2, D_3, D_4).
  private:
    static constexpr FF inv_denom_1 = ((D2 - D3) * (D2 - D4)).invert();
    static constexpr FF inv_denom_2 = ((D3 - D2) * (D3 - D4)).invert();
    static constexpr FF inv_denom_3 = ((D4 - D2) * (D4 - D3)).invert();

  public:
    // Row 1 of V^{-1} (yields s_1 at row-start).
    static constexpr FF alpha_1_1 = D3 * D4 * inv_denom_1;
    static constexpr FF alpha_1_2 = -(D3 + D4) * inv_denom_1;
    static constexpr FF alpha_1_3 = inv_denom_1;

    // Row 2 of V^{-1} (yields s_2 at row-start).
    static constexpr FF alpha_2_1 = D2 * D4 * inv_denom_2;
    static constexpr FF alpha_2_2 = -(D2 + D4) * inv_denom_2;
    static constexpr FF alpha_2_3 = inv_denom_2;

    // Row 3 of V^{-1} (yields s_3 at row-start).
    static constexpr FF alpha_3_1 = D2 * D3 * inv_denom_3;
    static constexpr FF alpha_3_2 = -(D2 + D3) * inv_denom_3;
    static constexpr FF alpha_3_3 = inv_denom_3;

    // Sanity: verify V * alpha = identity at compile time. V[i][j] = D_{j+2}^i for i,j in {0,1,2}.
    // (V * alpha)[i][k] = sum_j V[i][j] * alpha_{j+1}_{i+1}... wait that's weird. Let me check column k
    // of (V * alpha)^T = alpha^T * V^T. The j-th row of alpha gives the inverse such that for the
    // node D_{j+1}, the polynomial alpha_{j}_1 + alpha_{j}_2 * x + alpha_{j}_3 * x^2 evaluates to
    // delta_{j, k} at x = D_{k+2}.
    // Row j evaluates at node D_{2}: alpha_{j}_1 + alpha_{j}_2 * D2 + alpha_{j}_3 * D2^2 = (j == 1).
    static_assert(alpha_1_1 + alpha_1_2 * D2 + alpha_1_3 * D2 * D2 == FF(1));
    static_assert(alpha_1_1 + alpha_1_2 * D3 + alpha_1_3 * D3 * D3 == FF(0));
    static_assert(alpha_1_1 + alpha_1_2 * D4 + alpha_1_3 * D4 * D4 == FF(0));
    static_assert(alpha_2_1 + alpha_2_2 * D2 + alpha_2_3 * D2 * D2 == FF(0));
    static_assert(alpha_2_1 + alpha_2_2 * D3 + alpha_2_3 * D3 * D3 == FF(1));
    static_assert(alpha_2_1 + alpha_2_2 * D4 + alpha_2_3 * D4 * D4 == FF(0));
    static_assert(alpha_3_1 + alpha_3_2 * D2 + alpha_3_3 * D2 * D2 == FF(0));
    static_assert(alpha_3_1 + alpha_3_2 * D3 + alpha_3_3 * D3 * D3 == FF(0));
    static_assert(alpha_3_1 + alpha_3_2 * D4 + alpha_3_3 * D4 * D4 == FF(1));

    using K8InternalRow = std::array<FF, 11>; // (w_r, w_o, w_4, u_0, ..., u_7)
    using K8EntryRow = std::array<FF, 10>;    // (w_r, w_o, w_4, u_0, ..., u_6)

    struct K8Tables {
        std::array<K8InternalRow, 5> s0_after_round;       // rounds 4, 5, 6, 7, 8
        std::array<K8InternalRow, 4> output_after_round_8; // out_0, out_1, out_2, out_3
        std::array<K8InternalRow, 3> forward_vandermonde_lhs;
        std::array<K8EntryRow, 7> entry_s0_after_round; // rounds 1, ..., 7
    };

  private:
    using Mat3 = std::array<std::array<FF, 3>, 3>;
    using Vec3 = std::array<FF, 3>;

    static Mat3 matmul(const Mat3& a, const Mat3& b)
    {
        Mat3 result{};
        for (size_t i = 0; i < 3; ++i) {
            for (size_t j = 0; j < 3; ++j) {
                FF value = FF(0);
                for (size_t k = 0; k < 3; ++k) {
                    value += a[i][k] * b[k][j];
                }
                result[i][j] = value;
            }
        }
        return result;
    }

    static Vec3 matvec(const Mat3& a, const Vec3& v)
    {
        Vec3 result{};
        for (size_t i = 0; i < 3; ++i) {
            FF value = FF(0);
            for (size_t k = 0; k < 3; ++k) {
                value += a[i][k] * v[k];
            }
            result[i] = value;
        }
        return result;
    }

    static K8Tables build_k8_tables()
    {
        const Vec3 ones = { FF(1), FF(1), FF(1) };
        const Mat3 identity = { { { FF(1), FF(0), FF(0) }, { FF(0), FF(1), FF(0) }, { FF(0), FF(0), FF(1) } } };
        const Mat3 A = { { { D2, FF(1), FF(1) }, { FF(1), D3, FF(1) }, { FF(1), FF(1), D4 } } };
        const Mat3 Vinv = { { { alpha_1_1, alpha_1_2, alpha_1_3 },
                              { alpha_2_1, alpha_2_2, alpha_2_3 },
                              { alpha_3_1, alpha_3_2, alpha_3_3 } } };

        std::array<Mat3, 9> powers{};
        powers[0] = identity;
        for (size_t i = 1; i < powers.size(); ++i) {
            powers[i] = matmul(powers[i - 1], A);
        }

        std::array<Vec3, 8> powers_times_one{};
        for (size_t i = 0; i < powers_times_one.size(); ++i) {
            powers_times_one[i] = matvec(powers[i], ones);
        }

        // Rows are b_1, b_2, b_3 coefficients over (w_r, w_o, w_4) and (u_0, u_1, u_2).
        const Mat3 Bw = { { { FF(1), FF(0), FF(0) }, { -FF(2), FF(1), FF(0) }, { -(SIGMA + FF(2)), -FF(1), FF(1) } } };
        const Mat3 Bu = { { { -D1, FF(0), FF(0) },
                            { FF(2) * D1 - FF(3), -D1, FF(0) },
                            { (SIGMA + FF(2)) * D1 - SIGMA - FF(3), D1 - FF(3), -D1 } } };

        auto build_internal_v_after = [&](size_t rounds) {
            std::array<K8InternalRow, 3> rows{};
            const Mat3 M = matmul(powers[rounds], Vinv);
            const Mat3 Mw = matmul(M, Bw);
            const Mat3 Mu = matmul(M, Bu);

            for (size_t lane = 0; lane < 3; ++lane) {
                rows[lane][0] = Mw[lane][0];
                rows[lane][1] = Mw[lane][1];
                rows[lane][2] = Mw[lane][2];
                rows[lane][3] = Mu[lane][0];
                rows[lane][4] = Mu[lane][1];
                rows[lane][5] = Mu[lane][2];
                for (size_t input_round = 0; input_round < rounds; ++input_round) {
                    rows[lane][3 + input_round] += powers_times_one[rounds - 1 - input_round][lane];
                }
            }
            return rows;
        };

        auto build_s0_after = [&](size_t round) {
            K8InternalRow row{};
            auto v_prev = build_internal_v_after(round - 1);
            for (size_t coeff = 0; coeff < row.size(); ++coeff) {
                row[coeff] = v_prev[0][coeff] + v_prev[1][coeff] + v_prev[2][coeff];
            }
            row[3 + round - 1] += D1;
            return row;
        };

        K8Tables tables{};
        for (size_t round = 4; round <= 8; ++round) {
            tables.s0_after_round[round - 4] = build_s0_after(round);
        }

        tables.output_after_round_8[0] = tables.s0_after_round[4];
        auto v_after_8 = build_internal_v_after(8);
        tables.output_after_round_8[1] = v_after_8[0];
        tables.output_after_round_8[2] = v_after_8[1];
        tables.output_after_round_8[3] = v_after_8[2];

        const std::array<Vec3, 3> lhs_weights = {
            { { FF(1), FF(1), FF(1) }, { D2, D3, D4 }, { D2 * D2, D3 * D3, D4 * D4 } }
        };
        for (size_t lhs = 0; lhs < 3; ++lhs) {
            for (size_t coeff = 0; coeff < tables.forward_vandermonde_lhs[lhs].size(); ++coeff) {
                tables.forward_vandermonde_lhs[lhs][coeff] =
                    lhs_weights[lhs][0] * tables.output_after_round_8[1][coeff] +
                    lhs_weights[lhs][1] * tables.output_after_round_8[2][coeff] +
                    lhs_weights[lhs][2] * tables.output_after_round_8[3][coeff];
            }
        }

        auto build_entry_s0_after = [&](size_t round) {
            K8EntryRow row{};
            const Mat3& v_matrix = powers[round - 1];
            for (size_t coeff = 0; coeff < 3; ++coeff) {
                row[coeff] = v_matrix[0][coeff] + v_matrix[1][coeff] + v_matrix[2][coeff];
            }
            for (size_t input_round = 0; input_round < round - 1; ++input_round) {
                const Vec3& v = powers_times_one[round - 2 - input_round];
                row[3 + input_round] += v[0] + v[1] + v[2];
            }
            row[3 + round - 1] += D1;
            return row;
        };
        for (size_t round = 1; round <= 7; ++round) {
            tables.entry_s0_after_round[round - 1] = build_entry_s0_after(round);
        }

        return tables;
    }

  public:
    static inline const K8Tables k8_tables = build_k8_tables();
};

} // namespace bb::crypto
