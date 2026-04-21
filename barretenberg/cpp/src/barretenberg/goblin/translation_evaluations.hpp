// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"

namespace bb {
/**
 * @brief Stores the evaluations of `op`, `Px`, `Py`, `z1`, and `z2` computed by the ECCVM Prover. These evaluations are
 * batched and checked against the `accumulated_result`, which is computed and verified by Translator.
 *
 * @tparam BF The base field of BN254, translation evaluations are represented in the base field.
 */
template <typename BF> struct TranslationEvaluations_ {
    BF op, Px, Py, z1, z2;
    static size_t size() { return (FrCodec::calc_num_fields<BF>()) * NUM_TRANSLATION_EVALUATIONS; }

    RefArray<BF, NUM_TRANSLATION_EVALUATIONS> get_all() { return { op, Px, Py, z1, z2 }; }

    std::array<std::string, NUM_TRANSLATION_EVALUATIONS> labels = {
        "Translation:op", "Translation:Px", "Translation:Py", "Translation:z1", "Translation:z2"
    };
};

/**
 * @brief Data passed from ECCVM Verifier to Translator Verifier for verification
 * @tparam FF The field type (either bb::fq or bigfield)
 */
template <typename FF> struct TranslatorInputData_ {
    FF evaluation_challenge_x;
    FF batching_challenge_v;
    FF accumulated_result;
};

} // namespace bb
