// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"

namespace bb {
/**
 * @brief Stores the evaluations from ECCVM, checked against the translator evaluations as a final step of translator.
 *
 * @tparam BF The base field of BN254, translation evaluations are represented in the base field.
 * @tparam FF The scalar field of BN254, used in Goblin to help convert the proof into a buffer for ACIR. Note that this
 * struct is also used by ECCVMVerifiers, where the second template parameter is not required, hence we set it to `void`
 * by default.
 */
template <typename BF, typename FF = void> struct TranslationEvaluations_ {
    BF op, Px, Py, z1, z2;
    static size_t size() { return field_conversion::calc_num_bn254_frs<BF>() * NUM_TRANSLATION_EVALUATIONS; }

    RefArray<BF, NUM_TRANSLATION_EVALUATIONS> get_all() { return { op, Px, Py, z1, z2 }; }

    std::array<std::string, NUM_TRANSLATION_EVALUATIONS> labels = {
        "Translation:op", "Translation:Px", "Translation:Py", "Translation:z1", "Translation:z2"
    };
    ;

    MSGPACK_FIELDS(op, Px, Py, z1, z2);
};

/**
 * @brief Efficiently compute \f$ \text{translation_masking_term_eval} \cdot x^{N}\f$, where \f$ N =
 * 2^{\text{CONST_ECCVM_LOG_N}}  - \text{NUM_DISABLED_ROWS_IN_SUMCHECK}  \f$.
 * @details As described in \ref ECCVMProver::compute_translation_opening_claims(), Translator's
 * `accumulated_result` \f$ A \f$ satisfies \f{align}{ x\cdot A = \sum_i \widetilde{T}_i v^i - X^N \cdot
 * \text{translation_masking_term_eval}. \f} Therefore, before propagating the `translation_masking_term_eval`,
 * ECCVMVerifier needs to multiply it by \f$ x^N \f$.
 */
template <typename FF>
static void shift_translation_masking_term_eval(const FF& evaluation_challenge_x, FF& translation_masking_term_eval)
{
    // This method is only invoked within Goblin, which runs ECCVM with a fixed size.
    static constexpr size_t ECCVM_FIXED_SIZE = 1UL << CONST_ECCVM_LOG_N;

    FF x_to_circuit_size = evaluation_challenge_x.pow(ECCVM_FIXED_SIZE);

    // Compute X^{NUM_DISABLED_ROWS_IN_SUMCHECK}
    const FF x_to_NUM_DISABLED_ROWS_IN_SUMCHECK = evaluation_challenge_x.pow(NUM_DISABLED_ROWS_IN_SUMCHECK);

    // Update `translation_masking_term_eval`
    translation_masking_term_eval *= x_to_circuit_size;
    translation_masking_term_eval *= x_to_NUM_DISABLED_ROWS_IN_SUMCHECK.invert();
};
} // namespace bb
