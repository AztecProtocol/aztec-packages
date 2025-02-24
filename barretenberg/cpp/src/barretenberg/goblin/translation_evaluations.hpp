#pragma once
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

    std::array<BF*, NUM_TRANSLATION_EVALUATIONS> get_all() { return { &op, &Px, &Py, &z1, &z2 }; }

    std::array<std::string, NUM_TRANSLATION_EVALUATIONS> labels = {
        "Translation:op", "Translation:Px", "Translation:Py", "Translation:z1", "Translation:z2"
    };
    ;

    MSGPACK_FIELDS(op, Px, Py, z1, z2);
};
} // namespace bb
