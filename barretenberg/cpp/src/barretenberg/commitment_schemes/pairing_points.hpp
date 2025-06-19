// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"

namespace bb {

/**
 * @brief An object storing two bn254 points that represent the inputs to a pairing check.
 * @details The points may represent the output of a single partial verification or the linear combination of multiple
 * sets of pairing points, i.e. a pairing point "accumulator".
 * @note This class is the native analog to the stdlib::PairingPoints class.
 *
 */
class PairingPoints {
    using Curve = curve::BN254;
    using CK = CommitmentKey<Curve>;
    using Point = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using VerifierCK = VerifierCommitmentKey<curve::BN254>;

  public:
    Point P0 = Point::infinity();
    Point P1 = Point::infinity();

    PairingPoints() = default;
    PairingPoints(const Point& P0, const Point& P1)
        : P0(P0)
        , P1(P1)
    {}

    /**
     * @brief Reconstruct the pairing points from limbs stored on the public inputs.
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

    /**
     * @brief Aggregate the current pairing points with another set of pairing points using a random scalar
     */
    void aggregate(const PairingPoints& other)
    {
        if (P0 == Point::infinity() || P1 == Point::infinity() || other.P0 == Point::infinity() ||
            other.P1 == Point::infinity()) {
            throw_or_abort("WARNING: Shouldn't be aggregating with Point at infinity! The pairing points are probably "
                           "uninitialized.");
        }
        Fr aggregation_separator = Fr::random_element();
        P0 = P0 + other.P0 * aggregation_separator;
        P1 = P1 + other.P1 * aggregation_separator;
    }

    /**
     * @brief Perform the pairing check
     */
    bool check() const
    {
        VerifierCK pcs_vkey{};
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1423): Rename to verifier_pcs_key or vckey or
        // something. Issue exists in many places besides just here.
        return pcs_vkey.pairing_check(P0, P1);
    }

    bool operator==(const PairingPoints& other) const = default;
};

} // namespace bb
