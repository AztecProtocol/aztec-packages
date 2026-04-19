// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

// Derived parameters for the K=4 compressed Poseidon2 internal-round encoding on BN254
// (7-wire committed-state variant: state[1..3] at row start are committed wires, not derived).
//
// See `barretenberg/cpp/src/barretenberg/relations/poseidon2_double_internal_round.md` for the
// relation design. This header only exposes the internal-matrix diagonals and Σ = D_2 + D_3 + D_4
// needed by the entry relation's linear coefficients; the 4-wire Vandermonde inverse machinery
// (Lagrange coefficients α_j^(k) and the pairwise-distinctness asserts on (D_2, D_3, D_4)) is
// not used in the committed-state encoding.

#pragma once

#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::crypto {

struct Poseidon2QuadBn254Params {
    using FF = Poseidon2Bn254ScalarFieldParams::FF;

    // Internal matrix diagonal D_i.
    static constexpr FF D1 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr FF D2 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr FF D3 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr FF D4 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];

    // Σ = D_2 + D_3 + D_4. Appears in the entry-relation coefficients.
    static constexpr FF SIGMA = D2 + D3 + D4;
};

} // namespace bb::crypto
