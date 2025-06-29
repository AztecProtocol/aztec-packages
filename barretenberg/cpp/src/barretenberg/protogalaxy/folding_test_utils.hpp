// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"

namespace bb {

/**
 * @brief Utility to manually compute the target sum of an accumulator and compare it to the one produced in Protogalxy
 * to attest correctness.
 *
 * @details As we create a ProtogalaxyProverInternal object with an empty execution trace tracker and no active_ranges
 * set, compute_row_evaluations will operate on all rows.
 */
template <typename Flavor>
static bool check_accumulator_target_sum_manual(const std::shared_ptr<DeciderProvingKey_<Flavor>>& accumulator)
{
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor, 2>;
    using PGInternal = ProtogalaxyProverInternal<DeciderProvingKeys>;

    const size_t accumulator_size = accumulator->metadata.circuit_size;
    PGInternal pg_internal;
    const auto expected_honk_evals = pg_internal.compute_row_evaluations(
        accumulator->polynomials, accumulator->alphas, accumulator->relation_parameters);
    // Construct pow(\vec{betas*}) as in the paper
    GateSeparatorPolynomial expected_gate_separators(accumulator->gate_challenges, accumulator->gate_challenges.size());

    // Compute the corresponding target sum and create a dummy accumulator
    typename Flavor::FF expected_target_sum{ 0 };
    for (size_t idx = 0; idx < accumulator_size; idx++) {
        expected_target_sum += expected_honk_evals[idx] * expected_gate_separators[idx];
    }
    return accumulator->target_sum == expected_target_sum;
}
} // namespace bb
