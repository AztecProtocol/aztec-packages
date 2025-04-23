// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/std_array.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace bb {

/**
 * @brief Stores the fixed ECCVM VK commitments (to precomputed polynomials) that depend only on the circuit size
 * constant ECCVM_FIXED_SIZE.
 * @details If the constant ECCVM_FIXED_SIZE changes, these commitments must be updated accordingly. Their values can be
 * obtained from the test ECCVMTests::FixedVK.
 *
 */
class ECCVMFixedVKCommitments {
  public:
    using Commitment = curve::Grumpkin::AffineElement;

    static constexpr std::vector<Commitment> get_all()
    {
        return { // lagrange_first
                 Commitment(uint256_t("0x1b38d3ca76ed177424415672027d98459a875ed1aa43bb969ecffd9e4428c0d1"),
                            uint256_t("0x1ee6866622f6e654361830d9f545e0943d26876e03aafa0c4cc6772d1c277d46")),

                 // lagrange_second
                 Commitment(uint256_t("0x28cc5109376bdec7cdea99ea99cd0b14151f735ed8cd1687f5154cafc5718900"),
                            uint256_t("0x13df90d6be58ebcfb1b767db72f4c3fe3b98afd7a0094d69cdea854128819bc9")),

                 // lagrange_last
                 Commitment(uint256_t("0x1a0f8fc6e94945c7036f59179a0fb25fdaf4dce29f9a9ad84ed4e17faa25903a"),
                            uint256_t("0x1d55ee861aa772391f6486f9a1f24f503b4905eb8c10555bd44c4f406259a913"))
        };
    }
};

} // namespace bb
