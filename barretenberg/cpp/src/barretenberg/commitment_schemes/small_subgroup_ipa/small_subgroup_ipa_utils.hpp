// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/constants.hpp"

#include <array>
#include <string>

namespace bb {

/**
 * @brief Shared by Prover and Verifier. `label_prefix` is either `Libra:` or `Translation:`.
 */
inline std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> get_evaluation_labels(const std::string& label_prefix)
{
    return { label_prefix + "concatenation_eval",
             label_prefix + "grand_sum_shift_eval",
             label_prefix + "grand_sum_eval",
             label_prefix + "quotient_eval" };
};

/**
 * @brief The verification of Grand Sum Identity requires the evaluations G(r), A(g * r), A(r), Q(r). Shared by Prover
 * and Verifier.
 */
template <typename FF>
inline std::array<FF, NUM_SMALL_IPA_EVALUATIONS> compute_evaluation_points(const FF& small_ipa_evaluation_challenge,
                                                                           const FF& subgroup_generator)
{
    return { small_ipa_evaluation_challenge,
             small_ipa_evaluation_challenge * subgroup_generator,
             small_ipa_evaluation_challenge,
             small_ipa_evaluation_challenge };
}

/**
 * @brief Contains commitments to polynomials [G], [A], and [Q]. See \ref SmallSubgroupIPAProver docs.
 */
template <typename Commitment> struct SmallSubgroupIPACommitments {
    Commitment concatenated, grand_sum, quotient;
    // The grand sum commitment is returned twice since we are opening the corresponding polynomial at 2 points.
    RefArray<Commitment, NUM_SMALL_IPA_EVALUATIONS> get_all()
    {
        return { concatenated, grand_sum, grand_sum, quotient }; // {[G], [A], [A], [Q]}
    };
};
} // namespace bb
