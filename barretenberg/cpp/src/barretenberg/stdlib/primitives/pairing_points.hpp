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

static constexpr bb::fq DEFAULT_PAIRING_POINTS_P0_X(
    "0x031e97a575e9d05a107acb64952ecab75c020998797da7842ab5d6d1986846cf");
static constexpr bb::fq DEFAULT_PAIRING_POINTS_P0_Y(
    "0x178cbf4206471d722669117f9758a4c410db10a01750aebb5666547acf8bd5a4");
static constexpr bb::fq DEFAULT_PAIRING_POINTS_P1_X(
    "0x0f94656a2ca489889939f81e9c74027fd51009034b3357f0e91b8a11e7842c38");
static constexpr bb::fq DEFAULT_PAIRING_POINTS_P1_Y(
    "0x1b52c2020d7464a0c80c0da527a08193fe27776f50224bd6fb128b46c1ddb67f");

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
    Group P0;
    Group P1;

    bool has_data = false;
    uint32_t tag_index = 0; // Index of the tag for tracking pairing point aggregation

    // Number of bb::fr field elements used to represent a goblin element in the public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

    PairingPoints() = default;

    PairingPoints(const Group& P0, const Group& P1)
        : P0(P0)
        , P1(P1)
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

    Group& operator[](size_t idx)
    {
        BB_ASSERT(idx < 2, "Index out of bounds");
        return idx == 0 ? P0 : P1;
    }

    const Group& operator[](size_t idx) const
    {
        BB_ASSERT(idx < 2, "Index out of bounds");
        return idx == 0 ? P0 : P1;
    }

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
     * @details Each point is 4 field elements (2 per coordinate), total 8 field elements.
     *
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    uint32_t set_public()
    {
        BB_ASSERT(this->has_data, "Calling set_public on empty pairing points.");

        const uint32_t start_idx = P0.set_public();
        P1.set_public();

        return start_idx;
    }

    /**
     * @brief Set the witness indices for the default limbs of the pairing points to public.
     * @details Creates default pairing points as witnesses using bigfield, then sets them public.
     *
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    static uint32_t set_default_to_public(Builder* builder)
    {
        // Create default coordinates using the curve's Fq type (goblin_field for Mega, bigfield for Ultra)
        Fq x0(DEFAULT_PAIRING_POINTS_P0_X);
        Fq y0(DEFAULT_PAIRING_POINTS_P0_Y);
        Fq x1(DEFAULT_PAIRING_POINTS_P1_X);
        Fq y1(DEFAULT_PAIRING_POINTS_P1_Y);

        x0.convert_constant_to_fixed_witness(builder);
        y0.convert_constant_to_fixed_witness(builder);
        x1.convert_constant_to_fixed_witness(builder);
        y1.convert_constant_to_fixed_witness(builder);

        // Set all as public in correct order: P0.x, P0.y, P1.x, P1.y (2 frs per coordinate)
        const uint32_t start_idx = x0.set_public();
        y0.set_public();
        x1.set_public();
        y1.set_public();

        return start_idx;
    }

    /**
     * @brief Reconstruct PairingPoints from its representation as limbs (stored in the public inputs)
     * @details Uses StdlibCodec deserialization for consistent 2-limb-per-coordinate representation.
     *
     * @param limbs The limbs of the pairing points (4 frs per point = 8 total)
     * @return PairingPoints<Curve>
     */
    static PairingPoints<Curve> reconstruct_from_public(const std::span<const Fr, PUBLIC_INPUTS_SIZE>& limbs)
    {
        using Codec = StdlibCodec<Fr>;

        constexpr size_t FRS_PER_POINT = Codec::template calc_num_fields<Group>();
        static_assert(PUBLIC_INPUTS_SIZE == 2 * FRS_PER_POINT);

        Group P0 = Codec::template deserialize_from_fields<Group>(limbs.subspan(0, FRS_PER_POINT));
        Group P1 = Codec::template deserialize_from_fields<Group>(limbs.subspan(FRS_PER_POINT, FRS_PER_POINT));

        return { P0, P1 };
    }

    /**
     * @brief Construct default pairing points.
     *
     * @param builder
     */
    static PairingPoints construct_default()
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): These are pairing points extracted from a
        // valid proof. This is a workaround because we can't represent the point at infinity in biggroup yet.
        Fq x0(DEFAULT_PAIRING_POINTS_P0_X);
        Fq y0(DEFAULT_PAIRING_POINTS_P0_Y);
        Fq x1(DEFAULT_PAIRING_POINTS_P1_X);
        Fq y1(DEFAULT_PAIRING_POINTS_P1_Y);

        // These are known, valid points, so we can skip the curve checks.
        Group P0(x0, y0, /*assert_on_curve=*/false);
        Group P1(x1, y1, /*assert_on_curve=*/false);

        return { P0, P1 };
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
