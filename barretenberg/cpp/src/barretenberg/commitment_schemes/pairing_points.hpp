// === AUDIT STATUS ===
// internal:    { status: complete, auditors: [Luke], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"

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
    using Point = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using VerifierCK = VerifierCommitmentKey<curve::BN254>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

    // Array-like interface for Codec compatibility
    using value_type = Point;
    static constexpr size_t SIZE = 2;

    // Named accessors
    Point& P0() { return _points[0]; }
    Point& P1() { return _points[1]; }
    const Point& P0() const { return _points[0]; }
    const Point& P1() const { return _points[1]; }

    PairingPoints() = default;
    PairingPoints(const Point& p0, const Point& p1)
        : _points{ p0, p1 }
    {}

    // Iterator support for range-based for (required by Codec)
    auto begin() { return _points.begin(); }
    auto end() { return _points.end(); }
    auto begin() const { return _points.begin(); }
    auto end() const { return _points.end(); }
    static constexpr size_t size() { return SIZE; }

    /**
     * @brief Aggregate the current pairing points with another set of pairing points using a random scalar.
     * @details A pairing accumulator is valid only when it is either fully default (both points at infinity,
     * i.e. uninitialized) or fully populated (neither point at infinity). A mixed-infinity state (exactly one
     * point at infinity) is corrupt and must never be silently treated as uninitialized, otherwise a real
     * accumulator point would be discarded. The incoming points must always be the output of an actual PCS
     * verification, so they must be fully populated.
     */
    void aggregate(const PairingPoints<Curve>& other)
    {
        const bool this_p0_inf = (P0() == Point::infinity());
        const bool this_p1_inf = (P1() == Point::infinity());
        const bool other_p0_inf = (other.P0() == Point::infinity());
        const bool other_p1_inf = (other.P1() == Point::infinity());

        const bool this_is_default = this_p0_inf && this_p1_inf;
        const bool this_is_mixed = this_p0_inf != this_p1_inf;
        const bool other_is_default = other_p0_inf && other_p1_inf;
        const bool other_is_mixed = other_p0_inf != other_p1_inf;

        if (other_is_default || other_is_mixed) {
            throw_or_abort("Cannot aggregate: incoming pairing points are at infinity or mixed-infinity.");
        }
        if (this_is_mixed) {
            throw_or_abort("Cannot aggregate: accumulator pairing points are mixed-infinity (corrupted state).");
        }
        // Only a fully-default accumulator is uninitialized; adopt the incoming points.
        if (this_is_default) {
            *this = other;
            return;
        }
        Fr aggregation_separator = Fr::random_element();
        P0() = P0() + other.P0() * aggregation_separator;
        P1() = P1() + other.P1() * aggregation_separator;
    }

    /**
     * @brief Verify the pairing equation e(P0, [1]₂) · e(P1, [x]₂) = 1.
     */
    bool check() const
    {
        BB_BENCH_NAME("PairingPoints::check");
        VerifierCK vck{};
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1423): Rename to verifier_pcs_key or vckey or
        // something. Issue exists in many places besides just here.
        return vck.pairing_check(P0(), P1());
    }

  private:
    std::array<Point, 2> _points = { Point::infinity(), Point::infinity() };
};

} // namespace bb

// Enable std::tuple_size for Codec compatibility (array-like deserialization)
namespace std {
template <typename Curve> struct tuple_size<bb::PairingPoints<Curve>> : std::integral_constant<size_t, 2> {};
} // namespace std
