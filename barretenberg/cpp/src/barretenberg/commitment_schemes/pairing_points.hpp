// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"

namespace bb {

/**
 *
 */
class PairingPoints {
    using Curve = curve::BN254;
    using CK = CommitmentKey<Curve>;
    using Point = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using VerifierCommitmentKey = VerifierCommitmentKey<curve::BN254>;

  public:
    Point P0 = Point::infinity();
    Point P1 = Point::infinity();

    PairingPoints() = default;
    PairingPoints(const Point& P0, const Point& P1)
        : P0(P0)
        , P1(P1)
    {}

    /**
     * @brief Reconstruct an opening claim from limbs stored on the public inputs.
     * @note Implemented only for an opening claim over Grumpkin for use with IPA.
     *
     */
    static PairingPoints reconstruct_from_public(const std::span<const Fr, PAIRING_POINTS_SIZE>& limbs_in)
    {
        const size_t FRS_PER_FQ = 4;
        const auto recover_fq_from_limbs = [](std::array<Fr, FRS_PER_FQ> limbs) {
            const uint256_t limb = uint256_t(limbs[0]) +
                                   (uint256_t(limbs[1]) << stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION) +
                                   (uint256_t(limbs[2]) << (stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 2)) +
                                   (uint256_t(limbs[3]) << (stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 3));
            return Fq(limb);
        };

        const auto extract_limbs = [&](size_t start_idx) {
            std::array<Fr, FRS_PER_FQ> result;
            for (size_t i = 0; i < FRS_PER_FQ; ++i) {
                result[i] = limbs_in[start_idx + i];
            }
            return result;
        };

        Fq P0_x = recover_fq_from_limbs(extract_limbs(0));
        Fq P0_y = recover_fq_from_limbs(extract_limbs(1 * FRS_PER_FQ));
        Fq P1_x = recover_fq_from_limbs(extract_limbs(2 * FRS_PER_FQ));
        Fq P1_y = recover_fq_from_limbs(extract_limbs(3 * FRS_PER_FQ));

        Point P0{ P0_x, P0_y };
        Point P1{ P1_x, P1_y };

        return PairingPoints{ P0, P1 };
    }

    void aggregate(const PairingPoints& other)
    {
        Fr aggregation_separator = Fr::random_element();
        P0 = P0 + other.P0 * aggregation_separator;
        P1 = P1 + other.P1 * aggregation_separator;
    }

    bool check() const
    {
        VerifierCommitmentKey pcs_vkey{};
        return pcs_vkey.pairing_check(P0, P1);
    }

    /**
     *
     */
    bool verify() const { return false; };

    bool operator==(const PairingPoints& other) const = default;
};

} // namespace bb
