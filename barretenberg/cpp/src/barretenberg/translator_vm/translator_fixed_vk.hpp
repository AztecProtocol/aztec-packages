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
                 // lagrange_real_last
                 Commitment(uint256_t("0x01174317469d780150b4a2f54b77ba52bc4bc84136b1a7fd5483710234af7f81"),
                            uint256_t("0x174caee01a8d7fb79e7834367d842900e5893e35054a6cbbc67dfa8b0aa6bea5")),

                 // lagrange_odd_in_minicircuit
                 Commitment(uint256_t("0x23a983a5963d5075a40b895e7864c215e84ba1c92a5585485057ab8981e763ff"),
                            uint256_t("0x062238be20d523bd606a9c2727fcf1567babbb86f24c5ae0d2d008e10a5270ca")),

                 // lagrange_even_in_minicircuit
                 Commitment(uint256_t("0x08033ad1c8aa97c7b58d5053702f7795ec1f421523626e88ca5161c09533f03c"),
                            uint256_t("0x25730345e6886b41058e42f29586102a2e00fd46650628d67156b1445d358608")),

                 // lagrange_result_row
                 Commitment(uint256_t("0x262d212add82bcbcf96d0773c59926e1b8e68e45c662f9348f2e4f64770595b3"),
                            uint256_t("0x2fe4de705da2b7bfb03cb3baa199ed4cc97e6ce620d0e939b603493223e88703")),

                 // lagrange_last_in_minicircuit
                 Commitment(uint256_t("0x199c9a28f7a5d9e583b74f41c6a8b85a659a6bfd134ed40158d2e46c882db82d"),
                            uint256_t("0x1fffd61501ac54f7080b12b080542bd681b6a50b8c31baf40538ed814b8093b8")),

                 // lagrange_masking
                 Commitment(uint256_t("0x242c54018bd46a1bff9f2a3013d93e85d65736f7ae26b150c1661d76207bc56e"),
                            uint256_t("0x0e0602fc16675e0f0e11b9c509608a43fd8ac75d779ae3f69cbbba7a647c736a")),

                 // lagrange_mini_masking
                 Commitment(uint256_t("0x0d196a5c600fbdd14809692103339b55ed2196ba9157657c154ce47583db6451"),
                            uint256_t("0x168bd1b1498c739037b4ba885c603bf7db03fe1cf3401f16e3beac898abc52cf")),

                 // lagrange_real_last
                 // lagrange_last
                 Commitment(uint256_t("0x2002af3e8eb19710935fe8c13b377c8b9b14fae2557149459b556603fbd31827"),
                            uint256_t("0x23f77a89cc9b2d9ef5455f89a4e1da6761868b0b52e1f511c0b02453391b2151"))
        };
    }

    // Other members of TranslatorFixedVKCommitments
};

} // namespace bb
