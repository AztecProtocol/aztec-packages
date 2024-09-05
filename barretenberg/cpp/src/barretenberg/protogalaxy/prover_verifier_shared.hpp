#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <vector>

namespace bb {
/**
 * @brief Compute the gate challenges used in the combiner calculation.
 * @details This is Step 8 of the protocol as written in the paper.
 */
std::vector<fr> update_gate_challenges(const fr& perturbator_challenge,
                                       const std::vector<fr>& gate_challenges,
                                       const std::vector<fr>& init_challenges);

/**
 * @brief Given δ, compute the vector [δ, δ^2,..., δ^num_powers].
 * @details This is Step 2 of the protocol as written in the paper.
 */
std::vector<fr> compute_round_challenge_pows(const size_t num_powers, const fr& round_challenge);

} // namespace bb