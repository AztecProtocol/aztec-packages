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
                 Commitment(uint256_t("0x2a39a989a4a1aded32a44c29c7ed5b0207d0ae06285d68c1b77713c7fcecc656"),
                            uint256_t("0x08f5da6aaa2a8c46d71bb29d505258605c1965e37cfb0b2f85c9ec86fd58d756")),

                 // lagrange_even_in_minicircuit
                 Commitment(uint256_t("0x106446297fef0a6ab71219f95f448dea4460f7c1e367fe63563d88037002f1d2"),
                            uint256_t("0x2e879e1eae7cbc59c12b82eb571dc09bcd0e7d596fe7f185f557e2457eca6232")),

                 // lagrange_result_row
                 Commitment(uint256_t("0x020ad6e43ccd48a6a39e43897cc85187bd364919be8a3b82d4809715cfe489db"),
                            uint256_t("0x21a79ebae2ea3d92b49c521407d2600ac061146f2c188c6c6a33c598179e4543")),

                 // lagrange_last_in_minicircuit
                 Commitment(uint256_t("0x0e6eed29ced553697d8e1d27b4cd22aaefef06d7f3b8fd1e1ef2500924cffc02"),
                            uint256_t("0x04d1618368348731578609ff8111de1c7d9538784c5162b6f83e12e49f77938d")),

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
