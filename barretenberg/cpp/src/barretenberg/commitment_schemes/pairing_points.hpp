// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
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
    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

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
    static PairingPoints reconstruct_from_public(const std::span<const Fr, PUBLIC_INPUTS_SIZE>& limbs_in)
    {
        const std::span<const bb::fr, Point::PUBLIC_INPUTS_SIZE> P0_limbs(limbs_in.data(), Point::PUBLIC_INPUTS_SIZE);
        const std::span<const bb::fr, Point::PUBLIC_INPUTS_SIZE> P1_limbs(limbs_in.data() + Point::PUBLIC_INPUTS_SIZE,
                                                                          Point::PUBLIC_INPUTS_SIZE);
        Point P0 = Point::reconstruct_from_public(P0_limbs);
        Point P1 = Point::reconstruct_from_public(P1_limbs);

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
