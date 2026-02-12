// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/assert.hpp"

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

    std::array<Point, 2> _points = { Point::infinity(), Point::infinity() };

    // Named accessors
    Point& P0() { return _points[0]; }
    Point& P1() { return _points[1]; }
    const Point& P0() const { return _points[0]; }
    const Point& P1() const { return _points[1]; }

    PairingPoints() = default;
    PairingPoints(const Point& p0, const Point& p1)
        : _points{ p0, p1 }
    {}

    auto& operator[](size_t idx) { return _points[idx]; }
    const auto& operator[](size_t idx) const { return _points[idx]; }

    // Iterator support for range-based for (required by Codec)
    auto begin() { return _points.begin(); }
    auto end() { return _points.end(); }
    auto begin() const { return _points.begin(); }
    auto end() const { return _points.end(); }
    static constexpr size_t size() { return SIZE; }

    /**
     * @brief Aggregate the current pairing points with another set of pairing points using a random scalar
     */
    void aggregate(const PairingPoints<Curve>& other)
    {
        if (P0() == Point::infinity() || P1() == Point::infinity() || other.P0() == Point::infinity() ||
            other.P1() == Point::infinity()) {
            throw_or_abort("WARNING: Shouldn't be aggregating with Point at infinity! The pairing points are probably "
                           "uninitialized.");
        }
        Fr aggregation_separator = Fr::random_element();
        P0() = P0() + other.P0() * aggregation_separator;
        P1() = P1() + other.P1() * aggregation_separator;
    }

    /**
     * @brief Perform the pairing check
     */
    bool check() const
    {
        VerifierCK pcs_vkey{};
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1423): Rename to verifier_pcs_key or vckey or
        // something. Issue exists in many places besides just here.
        return pcs_vkey.pairing_check(P0(), P1());
    }

    bool operator==(const PairingPoints<Curve>& other) const = default;
};

} // namespace bb

// Enable std::tuple_size for Codec compatibility (array-like deserialization)
namespace std {
template <typename Curve> struct tuple_size<bb::PairingPoints<Curve>> : std::integral_constant<size_t, 2> {};
} // namespace std
