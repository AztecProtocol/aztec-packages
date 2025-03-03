#pragma once

#include "barretenberg/commitment_schemes/utils/test_settings.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_translation_data.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"

#include <array>
#include <vector>

namespace bb {

inline std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> get_evaluation_labels(const std::string& label_prefix)
{
    return { label_prefix + "concatenation_eval",
             label_prefix + "grand_sum_shift_eval",
             label_prefix + "grand_sum_eval",
             label_prefix + "quotient_eval" };
};

inline std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> get_commitment_labels(const std::string& label_prefix)
{
    return { label_prefix + "concatenation_eval",
             label_prefix + "grand_sum_shift_eval",
             label_prefix + "grand_sum_eval",
             label_prefix + "quotient_eval" };
};

template <typename FF>
inline std::array<FF, NUM_SMALL_IPA_EVALUATIONS> compute_evaluation_points(const FF& small_ipa_evaluation_challenge,
                                                                           const FF& subgroup_generator)
{
    return { small_ipa_evaluation_challenge,
             small_ipa_evaluation_challenge * subgroup_generator,
             small_ipa_evaluation_challenge,
             small_ipa_evaluation_challenge };
}
} // namespace bb
