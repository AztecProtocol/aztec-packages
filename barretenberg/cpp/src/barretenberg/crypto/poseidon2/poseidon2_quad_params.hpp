#pragma once

#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

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
};

} // namespace bb::crypto
