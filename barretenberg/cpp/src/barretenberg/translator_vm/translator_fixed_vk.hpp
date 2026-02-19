// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"

namespace bb {

/**
 * @brief Stores the fixed Translator VK commitment that depends only on the circuit size
 * constant CONST_TRANSLATOR_LOG_N.
 * @details Only ordered_extra_range_constraints_numerator needs a VK commitment — all other
 * precomputed selectors are structured multilinear polynomials whose evaluations the verifier
 * computes analytically (see TranslatorSelectorEvaluations::compute), so they never enter PCS.
 * If CONST_TRANSLATOR_LOG_N changes, this commitment and vk_hash must be updated accordingly.
 * Their values can be obtained from the test TranslatorTests::FixedVK.
 */
struct TranslatorHardcodedVKAndHash {
    using Commitment = curve::BN254::AffineElement;
    using FF = curve::BN254::ScalarField;

    // Precomputed VK hash (hash of the commitment below). Update via TranslatorTests::FixedVK if commitments change.
    static FF vk_hash() { return FF(uint256_t("0x281228e56fbfb62a424c94bda780104c9b5e758b8a02f148ce5e98c2867fdfc1")); }

    static std::vector<Commitment> get_all()
    {
        return {
            // ordered_extra_range_constraints_numerator (the only non-computable precomputed selector)
            Commitment(uint256_t("0x1ddbff0e1f0999f88ffa959e9505e5f489b57d6a7937c17a4d69fc871d5e9221"),
                       uint256_t("0x14149055853422bf016065386e8ea0ffb9425b454048e1cd14cfdca457aa7e17")),
        };
    }
};

} // namespace bb
