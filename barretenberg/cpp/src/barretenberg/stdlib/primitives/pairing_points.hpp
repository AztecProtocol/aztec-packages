// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <type_traits>

namespace bb::stdlib::recursion {

// Combined limbs for default pairing points: lo = limb0 + limb1 * 2^68, hi = limb2 + limb3 * 2^68
// These are the source of truth, used in set_default_to_public() to avoid expensive bigfield operations.
static constexpr bb::fr DEFAULT_PP_P0_X_LO =
    bb::fr("0x000000000000000000000000000000b75c020998797da7842ab5d6d1986846cf");
static constexpr bb::fr DEFAULT_PP_P0_X_HI =
    bb::fr("0x0000000000000000000000000000000000031e97a575e9d05a107acb64952eca");
static constexpr bb::fr DEFAULT_PP_P0_Y_LO =
    bb::fr("0x000000000000000000000000000000c410db10a01750aebb5666547acf8bd5a4");
static constexpr bb::fr DEFAULT_PP_P0_Y_HI =
    bb::fr("0x0000000000000000000000000000000000178cbf4206471d722669117f9758a4");
static constexpr bb::fr DEFAULT_PP_P1_X_LO =
    bb::fr("0x0000000000000000000000000000007fd51009034b3357f0e91b8a11e7842c38");
static constexpr bb::fr DEFAULT_PP_P1_X_HI =
    bb::fr("0x00000000000000000000000000000000000f94656a2ca489889939f81e9c7402");
static constexpr bb::fr DEFAULT_PP_P1_Y_LO =
    bb::fr("0x00000000000000000000000000000093fe27776f50224bd6fb128b46c1ddb67f");
static constexpr bb::fr DEFAULT_PP_P1_Y_HI =
    bb::fr("0x00000000000000000000000000000000001b52c2020d7464a0c80c0da527a081");

// TODO(https://github.com/AztecProtocol/barretenberg/issues/911): These are pairing points extracted from a
// valid proof. This is a workaround because we can't represent the point at infinity in biggroup yet.
// Derived from the combined limbs above: fq = lo + hi * 2^136
static constexpr bb::fq DEFAULT_PAIRING_POINT_P0_X =
    bb::fq(uint256_t(DEFAULT_PP_P0_X_LO) + (uint256_t(DEFAULT_PP_P0_X_HI) << 136));
static constexpr bb::fq DEFAULT_PAIRING_POINT_P0_Y =
    bb::fq(uint256_t(DEFAULT_PP_P0_Y_LO) + (uint256_t(DEFAULT_PP_P0_Y_HI) << 136));
static constexpr bb::fq DEFAULT_PAIRING_POINT_P1_X =
    bb::fq(uint256_t(DEFAULT_PP_P1_X_LO) + (uint256_t(DEFAULT_PP_P1_X_HI) << 136));
static constexpr bb::fq DEFAULT_PAIRING_POINT_P1_Y =
    bb::fq(uint256_t(DEFAULT_PP_P1_Y_LO) + (uint256_t(DEFAULT_PP_P1_Y_HI) << 136));

/**
 * @brief An object storing two EC points that represent the inputs to a pairing check.
 * @details The points may represent the output of a single partial recursive verification or the linear combination of
 * multiple sets of pairing points.
 *
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1421): Proper tests for `PairingPoints`
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1571): Implement tagging mechanism
 * @tparam Builder_
 */
template <typename Curve> struct PairingPoints {
    using Builder = typename Curve::Builder;
    using Group = Curve::Group;
    using Fq = Curve::BaseField;
    using Fr = Curve::ScalarField;

    // Number of bb::fr field elements used to represent pairing points in public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

    // Array-like interface for Codec compatibility
    using value_type = Group;
    static constexpr size_t SIZE = 2;

    // Points stored contiguously for iterator support
    Group P0;
    Group P1;

    // Metadata (after points to keep P0/P1 contiguous)
    bool has_data = false;
    uint32_t tag_index = 0; // Index of the tag for tracking pairing point aggregation

    PairingPoints() = default;

    PairingPoints(const Group& p0, const Group& p1)
        : P0(p0)
        , P1(p1)
        , has_data(true)
    {
        // Get the builder from the group elements and assign a new tag
        Builder* builder = P0.get_context();
        if (builder != nullptr) {
            tag_index = builder->pairing_points_tagging.create_pairing_point_tag();
        }

#ifndef NDEBUG
        bb::PairingPoints<typename Curve::NativeCurve> native_pp(P0.get_value(), P1.get_value());
        info("Are Pairing Points with tag ", tag_index, " valid? ", native_pp.check() ? "true" : "false");
#endif
    }

    PairingPoints(std::array<Group, 2> const& points)
        : PairingPoints(points[0], points[1])
    {}

    // Array-like accessors for Codec compatibility
    // Non-const version sets has_data since it's called during assignment (e.g., by Codec deserialization)
    Group& operator[](size_t idx)
    {
        has_data = true;
        return idx == 0 ? P0 : P1;
    }
    const Group& operator[](size_t idx) const { return idx == 0 ? P0 : P1; }

    // Iterator support for range-based for (required by Codec)
    // Non-const begin() sets has_data since it's called during Codec deserialization
    Group* begin()
    {
        has_data = true;
        return &P0;
    }
    Group* end() { return &P1 + 1; }
    const Group* begin() const { return &P0; }
    const Group* end() const { return &P1 + 1; }
    static constexpr size_t size() { return SIZE; }

    typename Curve::bool_ct operator==(PairingPoints const& other) const { return P0 == other.P0 && P1 == other.P1; };

    /**
     * @brief Aggregate multiple PairingPoints using random linear combination
     *
     * @details The pairing points are aggregated using challenges generated as the consecutive hashes of the pairing
     * points being aggregated. Computes: P_agg = P₀ + r₁·P₁ + r₂·P₂ + ... + rₙ₋₁·Pₙ₋₁
     * where r₁,...,rₙ₋₁ are 128-bit challenges derived from hashing all input points.
     *
     * @param pairing_points Vector of pairing points to aggregate (requires size > 1)
     * @param handle_edge_cases If true, batch_mul handles edge cases where points might be zero or challenges might
     * cause numerical issues. If false, assumes all points are non-zero and non-colliding (saves circuit gates).
     *
     * Safety of handle_edge_cases=false:
     * - Safe when all points are verifier-computed (deterministic, won't collide)
     * - Safe even with untrusted public input points, as the random challenges maintain binding
     * - Provides significant circuit gate savings in recursive verification
     * - Should only be disabled when the caller can guarantee point validity
     */
    static PairingPoints aggregate_multiple(std::vector<PairingPoints>& pairing_points, bool handle_edge_cases = true)
    {
        size_t num_points = pairing_points.size();
        BB_ASSERT_GT(num_points, 1UL, "This method should be used only with more than one pairing point.");

        std::vector<Group> first_components;
        first_components.reserve(num_points);
        std::vector<Group> second_components;
        second_components.reserve(num_points);
        for (const auto& points : pairing_points) {
            first_components.emplace_back(points.P0);
            second_components.emplace_back(points.P1);
        }

        // Fiat-Shamir: hash all points for binding, but only need n-1 challenges
        StdlibTranscript<Builder> transcript{};
        std::vector<std::string> labels;
        labels.reserve(num_points - 1); // Only need n-1 challenges
        for (size_t idx = 0; auto [first, second] : zip_view(first_components, second_components)) {
            transcript.add_to_hash_buffer("first_component_" + std::to_string(idx), first);
            transcript.add_to_hash_buffer("second_component_" + std::to_string(idx), second);
            // Generate challenges for points 1..n-1 (skip the first point)
            if (idx > 0) {
                labels.emplace_back("pp_aggregation_challenge_" + std::to_string(idx));
            }
            idx++;
        }

        std::vector<Fr> challenges = transcript.template get_challenges<Fr>(labels);

        // Aggregate: P_agg = P₀ + r₁·P₁ + r₂·P₂ + ... + rₙ₋₁·Pₙ₋₁
        Group P0, P1;

        // For MegaCircuitBuilder (Goblin): batch_mul optimizes constant scalar 1 (uses add instead of mul)
        // so we can include all points in a single batch_mul with scalar [1, r₁, r₂, ..., rₙ₋₁]
        // For UltraCircuitBuilder: no optimization for witness point × constant(1), so keep first point separate
        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            // Single batch_mul for all points (efficient for Goblin with constant scalar 1)
            std::vector<Fr> scalars;
            scalars.reserve(num_points);
            scalars.push_back(Fr(1)); // Optimized by Goblin: add instead of mul
            scalars.insert(scalars.end(), challenges.begin(), challenges.end());

            P0 = Group::batch_mul(first_components, scalars, 128, handle_edge_cases);
            P1 = Group::batch_mul(second_components, scalars, 128, handle_edge_cases);
        } else {
            // Use first point as base, then batch_mul remaining points
            std::vector<Group> remaining_first(first_components.begin() + 1, first_components.end());
            std::vector<Group> remaining_second(second_components.begin() + 1, second_components.end());

            P0 = first_components[0];
            P1 = second_components[0];

            P0 += Group::batch_mul(remaining_first, challenges, 128, handle_edge_cases);
            P1 += Group::batch_mul(remaining_second, challenges, 128, handle_edge_cases);
        }

        PairingPoints aggregated_points(P0, P1);

        // Merge tags
        Builder* builder = P0.get_context();
        if (builder != nullptr) {
            for (const auto& points : pairing_points) {
                builder->pairing_points_tagging.merge_pairing_point_tags(aggregated_points.tag_index, points.tag_index);
            }
        }

        return aggregated_points;
    }

    /**
     * @brief Compute a linear combination of the present pairing points with an input set of pairing points
     * @details The linear combination is done with a recursion separator that is the hash of the two sets of pairing
     * points.
     * @param other
     * @param recursion_separator
     */
    void aggregate(PairingPoints const& other)
    {
        BB_ASSERT(other.has_data, "Cannot aggregate null pairing points.");

        // If LHS is empty, simply set it equal to the incoming pairing points
        if (!this->has_data && other.has_data) {
            *this = other;
            return;
        }
        // We use a Transcript because it provides us an easy way to hash to get a "random" separator.
        StdlibTranscript<Builder> transcript{};
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1375): Sometimes unnecesarily hashing constants
        transcript.add_to_hash_buffer("Accumulator_P0", P0);
        transcript.add_to_hash_buffer("Accumulator_P1", P1);
        transcript.add_to_hash_buffer("Aggregated_P0", other.P0);
        transcript.add_to_hash_buffer("Aggregated_P1", other.P1);
        auto recursion_separator =
            transcript.template get_challenge<typename Curve::ScalarField>("recursion_separator");
        // If Mega Builder is in use, the EC operations are deferred via Goblin
        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1385): Can we improve efficiency here?
            P0 = Group::batch_mul({ P0, other.P0 }, { 1, recursion_separator });
            P1 = Group::batch_mul({ P1, other.P1 }, { 1, recursion_separator });
        } else {
            // Save gates using short scalars.
            Group point_to_aggregate = other.P0.scalar_mul(recursion_separator, 128);
            P0 += point_to_aggregate;
            point_to_aggregate = other.P1.scalar_mul(recursion_separator, 128);
            P1 += point_to_aggregate;
        }

        // Merge the tags in the builder
        Builder* builder = P0.get_context();
        if (builder != nullptr) {
            builder->pairing_points_tagging.merge_pairing_point_tags(this->tag_index, other.tag_index);
        }

#ifndef NDEBUG
        bb::PairingPoints<typename Curve::NativeCurve> native_pp(P0.get_value(), P1.get_value());
        info("Are aggregated Pairing Points with tag ", tag_index, " valid? ", native_pp.check() ? "true" : "false");
#endif
    }

    /**
     * @brief Set the witness indices for the pairing points to public
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    uint32_t set_public()
    {
        BB_ASSERT(this->has_data, "Calling set_public on empty pairing points.");
        uint32_t start_idx = P0.set_public();
        P1.set_public();
        return start_idx;
    }

    /**
     * @brief Set the witness indices for the default limbs of the pairing points to public.
     * @details Optimized version that directly sets precomputed Fr limb values as public inputs,
     *          avoiding expensive bigfield operations. The default pairing points satisfy the
     *          pairing equation, which is verified at compile time via static assertion.
     *
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    static uint32_t set_default_to_public(Builder* builder)
    {
        // Directly add precomputed combined limbs as public inputs, bypassing bigfield's self_reduce.
        // These values encode the default pairing points in the format used by bigfield::set_public().
        // Order: P0.x (lo, hi), P0.y (lo, hi), P1.x (lo, hi), P1.y (lo, hi)
        // Each fix_witness call adds 1 gate to constrain the value at the VK level.
        auto add_fixed_public = [&](const bb::fr& value) {
            uint32_t idx = builder->add_public_variable(value);
            builder->fix_witness(idx, value);
            return idx;
        };

        uint32_t start_idx = add_fixed_public(DEFAULT_PP_P0_X_LO);
        add_fixed_public(DEFAULT_PP_P0_X_HI);
        add_fixed_public(DEFAULT_PP_P0_Y_LO);
        add_fixed_public(DEFAULT_PP_P0_Y_HI);
        add_fixed_public(DEFAULT_PP_P1_X_LO);
        add_fixed_public(DEFAULT_PP_P1_X_HI);
        add_fixed_public(DEFAULT_PP_P1_Y_LO);
        add_fixed_public(DEFAULT_PP_P1_Y_HI);

        return start_idx;
    }

    /**
     * @brief Construct default pairing points.
     */
    static PairingPoints construct_default()
    {
        Fq P0_x(DEFAULT_PAIRING_POINT_P0_X);
        Fq P0_y(DEFAULT_PAIRING_POINT_P0_Y);
        Fq P1_x(DEFAULT_PAIRING_POINT_P1_X);
        Fq P1_y(DEFAULT_PAIRING_POINT_P1_Y);

        // These are known, valid points, so we can skip the curve checks.
        Group P0(P0_x, P0_y, /*assert_on_curve=*/false);
        Group P1(P1_x, P1_y, /*assert_on_curve=*/false);

        return PairingPoints(P0, P1);
    }
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, PairingPoints<NCT> const& as)
{
    return os << "P0: " << as.P0 << "\n"
              << "P1: " << as.P1 << "\n"
              << "has_data: " << as.has_data << "\n"
              << "tag_index: " << as.tag_index << "\n";
}

} // namespace bb::stdlib::recursion

// Enable std::tuple_size for Codec compatibility (array-like deserialization)
namespace std {
template <typename Curve>
struct tuple_size<bb::stdlib::recursion::PairingPoints<Curve>> : std::integral_constant<size_t, 2> {};
} // namespace std
