// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"

namespace bb {

/**
 * @brief Stores the fixed Translator VK commitments (to precomputed polynomials) that depend only on the circuit size
 * constant CONST_TRANSLATOR_LOG_N.
 * @details If the constant CONST_TRANSLATOR_LOG_N changes, these commitments must be updated accordingly. Their values
 * can be obtained from the test TranslatorTests::FixedVK.
 *
 */
struct TranslatorFixedVKCommitments {
    using Commitment = curve::BN254::AffineElement;

    // Static method to create all commitments at once
    static std::vector<Commitment> get_all()
    {
        return { // ordered_extra_range_constraints_numerator
                 Commitment(uint256_t("0x1ddbff0e1f0999f88ffa959e9505e5f489b57d6a7937c17a4d69fc871d5e9221"),
                            uint256_t("0x14149055853422bf016065386e8ea0ffb9425b454048e1cd14cfdca457aa7e17")),

                 // lagrange_first
                 Commitment(uint256_t("0x0000000000000000000000000000000000000000000000000000000000000001"),
                            uint256_t("0x0000000000000000000000000000000000000000000000000000000000000002")),

                 // lagrange_last
                 Commitment(uint256_t("0x01174317469d780150b4a2f54b77ba52bc4bc84136b1a7fd5483710234af7f81"),
                            uint256_t("0x174caee01a8d7fb79e7834367d842900e5893e35054a6cbbc67dfa8b0aa6bea5")),

                 // lagrange_odd_in_minicircuit
                 Commitment(uint256_t("0x1c75e8718392aac0b4964929cf4aba064bd32e073214b101400881871dd4f99a"),
                            uint256_t("0x1afecd60ec5d28c2e0386035de8a31157c47c93130a9614fb864fc5094f3cf8c")),

                 // lagrange_even_in_minicircuit
                 Commitment(uint256_t("0x106446297fef0a6ab71219f95f448dea4460f7c1e367fe63563d88037002f1d2"),
                            uint256_t("0x2e879e1eae7cbc59c12b82eb571dc09bcd0e7d596fe7f185f557e2457eca6232")),

                 // lagrange_second
                 Commitment(uint256_t("0x2d360628289ff943ff6bd1a87bbe4e62abe7fb61ba83effd266f22bdcf31e6f9"),
                            uint256_t("0x26b92a79e563c3f48252cce7feeca2f0f8d33dcb4ef7b0643bf07bd405700aaa")),

                 // lagrange_second_to_last_in_minicircuit
                 Commitment(uint256_t("0x19431d41593771fe2fdf8b662e19f72f8257c41f318582e0cbacd4f8d613dd7c"),
                            uint256_t("0x124ff510d24efaf9c735383017b5be431bdc21c2087f9c5f1d6ae3673430eb4d")),

                 // lagrange_masking
                 Commitment::infinity(),

                 // lagrange_real_last
                 Commitment(uint256_t("0x01174317469d780150b4a2f54b77ba52bc4bc84136b1a7fd5483710234af7f81"),
                            uint256_t("0x174caee01a8d7fb79e7834367d842900e5893e35054a6cbbc67dfa8b0aa6bea5"))
        };
    }

    // Other members of TranslatorFixedVKCommitments
};

} // namespace bb
