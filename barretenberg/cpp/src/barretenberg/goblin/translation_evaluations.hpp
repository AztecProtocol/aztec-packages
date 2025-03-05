#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"

namespace bb {
/**
 * @brief Stores the evaluations from ECCVM, checked against the translator evaluations as a final step of translator.
 *
 * @tparam BF The base field of the curve, translation evaluations are represented in the base field.
 * @tparam FF The scalar field of the curve, used in Goblin to help convert the proof into a buffer for ACIR.
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
 * 2^{\text{CONST_ECCVM_LOG_N}} - 1 - \text{MASKING_OFFSET}  \f$.
 * @details As described in \ref ECCVMProver::compute_translation_opening_claims(), Translator's
 * `accumulated_result` \f$ A \f$ satisfies \f{align}{ x\cdot A = \sum_i \widetilde{T}_i v^i - X^N \cdot
 * \text{translation_masking_term_eval} \f} Therefore, before propagating the `translation_masking_term_eval`,
 * ECCVMVerifier needs to multiply it by \f$ x^ N \f$.
 */
template <typename FF>
static void shift_translation_masking_term_eval(const FF& evaluation_challenge_x, FF& translation_masking_term_eval)
{
    // static constexpr size_t log_masking_offset = numeric::get_msb(MASKING_OFFSET);
    // FF numerator{ 1 };

    // for (size_t idx = 0; idx < log_masking_offset; idx++) {
    //     numerator *= numerator.sqr();
    // }

    // const FF x_to_masking_offset = numerator;

    // for (size_t idx = log_masking_offset; idx < CONST_ECCVM_LOG_N; idx++) {
    //     numerator *= numerator.sqr();
    // }

    // const FF denominator = evaluation_challenge_x * x_to_masking_offset;

    // translation_masking_term_eval *= numerator;
    // translation_masking_term_eval *= denominator.invert();
    static constexpr size_t circuit_size = 1UL << CONST_PROOF_SIZE_LOG_N;
    size_t exponent = circuit_size - MASKING_OFFSET;
    // info(numerator / denominator);
    translation_masking_term_eval *= evaluation_challenge_x.pow(exponent);
};
} // namespace bb
