// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

// Derived parameters for the K=4 "quad" compressed Poseidon2 internal-round encoding on BN254.
// Treated like the base Poseidon2 constants: fixed, derivable from the sponge spec, pre-computed.
//
// See `barretenberg/cpp/src/barretenberg/relations/poseidon2_double_internal_round.md` for the
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
};

} // namespace bb::crypto
