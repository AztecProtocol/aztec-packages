// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"

namespace bb {

/**
 * @brief An object storing two EC points that represent the inputs to a pairing check.
 * @details The points may represent the output of a single partial verification or the linear combination of multiple
 * sets of pairing points, i.e. a pairing point "accumulator".
 * @note This class is unified with the stdlib::recursion::PairingPoints class via the Curve template parameter.
 * @tparam Curve_ The curve type (defaults to curve::BN254 for native, or use stdlib::bn254<Builder> for recursive)
 */
template <typename Curve_> class PairingPoints {
  public:
    using Curve = Curve_;
    using CK = CommitmentKey<Curve>;
    using Point = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using VerifierCK = VerifierCommitmentKey<curve::BN254>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

    // Array-like interface for Codec compatibility
    using value_type = Point;
    static constexpr size_t SIZE = 2;

    // Storage - public for direct access as P0/P1
    Point P0 = Point::infinity();
    Point P1 = Point::infinity();

    PairingPoints() = default;
    PairingPoints(const Point& p0, const Point& p1)
        : P0(p0)
        , P1(p1)
    {}

    PairingPoints(std::array<Point, 2> const& pts)
        : P0(pts[0])
        , P1(pts[1])
    {}

    // Array-like accessors for Codec compatibility
    Point& operator[](size_t idx) { return idx == 0 ? P0 : P1; }
    const Point& operator[](size_t idx) const { return idx == 0 ? P0 : P1; }

    // Iterator support for range-based for (required by Codec)
    Point* begin() { return &P0; }
    Point* end() { return &P1 + 1; }
    const Point* begin() const { return &P0; }
    const Point* end() const { return &P1 + 1; }
    static constexpr size_t size() { return SIZE; }

    /**
     * @brief Aggregate the current pairing points with another set of pairing points using a random scalar
     */
    void aggregate(const PairingPoints<Curve>& other)
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

    bool operator==(const PairingPoints<Curve>& other) const = default;
};

} // namespace bb

// Enable std::tuple_size for Codec compatibility (array-like deserialization)
namespace std {
template <typename Curve> struct tuple_size<bb::PairingPoints<Curve>> : std::integral_constant<size_t, 2> {};
} // namespace std
