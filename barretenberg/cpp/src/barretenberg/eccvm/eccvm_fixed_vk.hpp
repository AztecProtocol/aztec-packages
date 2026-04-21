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
    static BF vk_hash() { return BF(uint256_t("0x103f7a122fe63075eb8b9c6019cbd3cbe55b5775400799b12c63b31643515ff3")); }

    static std::vector<Commitment> get_all()
    {
        return { // lagrange_first (at row NUM_DISABLED_ROWS_IN_SUMCHECK)
                 Commitment(uint256_t("0x040948748b49a15e319d8ae97062ce125445f612bbf4265776490dafe4a75aa7"),
                            uint256_t("0x0674e7fcc6e6685f250a218ab444bef48b9772e3fb32425d579c4430f919828b")),

                 // lagrange_second (hiding op row)
                 Commitment(uint256_t("0x1976c760e4bde34db58394888baeda91f57bcdddf60aec28b721b10aac55f555"),
                            uint256_t("0x26eec8e50bdb2cfc3956e90bd72c9098d4a5de28c1c1c236955d14884a8f498d")),

                 // lagrange_third (first real op row, after hiding op row)
                 Commitment(uint256_t("0x1a96c5eae61aba7353221e65adf123d30255415db00b8063157f2764a3034e26"),
                            uint256_t("0x0d04425c0f370a7aaace3cf41f9b2380079c95fa26f9f83b5fd5e26813dbd289")),

                 // lagrange_last (at dyadic_size - 1)
                 Commitment(uint256_t("0x07099c9989bd2212d634a00180d59f1dd1279c5c3d220583ad4acfbfb180ae60"),
                            uint256_t("0x2fa02a4987281b3b310bb8d9724c36a20eec491acfd3be7e7f3dcf8d8bec8848"))
        };
    }
};

} // namespace bb
