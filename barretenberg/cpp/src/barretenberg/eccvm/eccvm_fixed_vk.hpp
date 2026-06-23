// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/std_array.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace bb {

/**
 * @brief Stores the fixed ECCVM VK commitments (to precomputed polynomials) that depend only on the circuit size
 * constant ECCVM_FIXED_SIZE.
 * @details If the constant ECCVM_FIXED_SIZE changes, these commitments and VK_HASH must be updated accordingly.
 * Their values can be obtained from the test ECCVMTests::FixedVK.
 *
 */
class ECCVMHardcodedVKAndHash {
  public:
    using Commitment = curve::Grumpkin::AffineElement;
    // BF = Grumpkin base field = BN254 scalar field (fr) - this is what the VK hash uses
    using BF = curve::Grumpkin::BaseField;

    // Precomputed VK hash (hash of all commitments below). Update via ECCVMTests::FixedVK if commitments change.
    static BF vk_hash() { return BF(uint256_t("0x032ece6c493f6e74ca8847127f189f8e759021e53df9820a88985e41e400fde2")); }

    static std::vector<Commitment> get_all()
    {
        return { // lagrange_first (at row NUM_DISABLED_ROWS_IN_SUMCHECK)
                 Commitment(uint256_t("0x1227d829cc03e51a2cc68ca0e08381c02b78c484f4092a10584ef78381a31968"),
                            uint256_t("0x10b233eb875fed8834f6235ed737946b68c0c7ed258053cd943dcc69212d90d6")),

                 // lagrange_second (hiding op row)
                 Commitment(uint256_t("0x1976c760e4bde34db58394888baeda91f57bcdddf60aec28b721b10aac55f555"),
                            uint256_t("0x26eec8e50bdb2cfc3956e90bd72c9098d4a5de28c1c1c236955d14884a8f498d")),

                 // lagrange_third (first real op row, after hiding op row)
                 Commitment(uint256_t("0x1a96c5eae61aba7353221e65adf123d30255415db00b8063157f2764a3034e26"),
                            uint256_t("0x0d04425c0f370a7aaace3cf41f9b2380079c95fa26f9f83b5fd5e26813dbd289")),

                 // lagrange_last (at dyadic_size - 1)
                 Commitment(uint256_t("0x23a271e0e1d99d2a526cc8c06df7edf7c86e9cb985e577affb5a64b9daf24401"),
                            uint256_t("0x12a74c457ae1f9bd6076c308f47a006deb82adfd576be1266cde1cdc0d008cd1"))
        };
    }
};

} // namespace bb
