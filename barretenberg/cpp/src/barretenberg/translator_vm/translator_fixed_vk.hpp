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
                 Commitment(uint256_t("0x16491ef34583b8dcf02b72539420bd9f6f136d67f0b89bb1f5a6cf4807262e41"),
                            uint256_t("0x0245dde06e03313da7eb50fd0abb975e7815123c78cba60f7c1ffd5fccac3130")),

                 // lagrange_even_in_minicircuit
                 Commitment(uint256_t("0x26e60bb02bfab925e3c071d634db06c34cc13f374f6d428d7f53026879729685"),
                            uint256_t("0x009edf9703a9135d5b60254628aa1fb96fe3d07aedbfef6f2bb985af12c595a7")),

                 // lagrange_result_row
                 Commitment(uint256_t("0x2c4e3788efe883d91b423233818890599ad233cecf88be80debce9e5ac727e29"),
                            uint256_t("0x0d79fb9abbbde1fdb4c53d148cfcf083e84f3153e6817f5a19f0560e831dda8f")),

                 // lagrange_last_in_minicircuit
                 Commitment(uint256_t("0x199c9a28f7a5d9e583b74f41c6a8b85a659a6bfd134ed40158d2e46c882db82d"),
                            uint256_t("0x1fffd61501ac54f7080b12b080542bd681b6a50b8c31baf40538ed814b8093b8")),

                 // lagrange_masking
                 Commitment(uint256_t("0x242c54018bd46a1bff9f2a3013d93e85d65736f7ae26b150c1661d76207bc56e"),
                            uint256_t("0x0e0602fc16675e0f0e11b9c509608a43fd8ac75d779ae3f69cbbba7a647c736a")),

                 // lagrange_mini_masking
                 Commitment(uint256_t("0x22b8edd8420b3d1a0bc80615304be63370f52186965801d4dfdec63b5566420e"),
                            uint256_t("0x23b5474c89f47b8de3ed3a606fbe4889a1cd22fd88ffb11d10b229ad07ee7b2d")),

                 // lagrange_real_last
                 // lagrange_last
                 Commitment(uint256_t("0x2002af3e8eb19710935fe8c13b377c8b9b14fae2557149459b556603fbd31827"),
                            uint256_t("0x23f77a89cc9b2d9ef5455f89a4e1da6761868b0b52e1f511c0b02453391b2151"))
        };
    }

    // Other members of TranslatorFixedVKCommitments
};

} // namespace bb
