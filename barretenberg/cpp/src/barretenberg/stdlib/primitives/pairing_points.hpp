// === AUDIT STATUS ===
// internal:    { status: complete, auditors: [Luke], commit: }
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

/**
 * @brief An object storing two EC points that represent the inputs to a pairing check.
 * @details The points may represent the output of a single partial recursive verification or the linear combination of
 * multiple sets of pairing points.
 *
 * @tparam Builder_
 */
template <typename Curve> struct PairingPoints {
    using Builder = typename Curve::Builder;
    using Group = Curve::Group;
    using Fq = Curve::BaseField;
    using Fr = Curve::ScalarField;

    // Number of bb::fr field elements used to represent pairing points in public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

    uint32_t tag_index = 0; // Index of the tag for tracking pairing point aggregation

    const Group& P0() const { return _points[0]; }
    const Group& P1() const { return _points[1]; }

    bool is_populated() const { return has_data_; }
    bool is_default() const { return is_default_; }

    PairingPoints() = default;

    PairingPoints(const Group& p0, const Group& p1)
        : _points{ p0, p1 }
        , has_data_(true)
    {
        Builder* builder = validate_context<Builder>(p0.get_context(), p1.get_context());
        if (builder != nullptr) {
            tag_index = builder->pairing_points_tagging.create_pairing_point_tag();
        }

#ifndef NDEBUG
        bb::PairingPoints<typename Curve::NativeCurve> native_pp(P0().get_value(), P1().get_value());
        info("Are Pairing Points with tag ", tag_index, " valid? ", native_pp.check() ? "true" : "false");
#endif
    }

    /**
     * @brief Reconstruct PairingPoints from public input limbs.
     */
    static PairingPoints reconstruct_from_public(
        const std::span<const stdlib::field_t<Builder>, PUBLIC_INPUTS_SIZE>& limbs)
    {
        using Codec = StdlibCodec<stdlib::field_t<Builder>>;
        constexpr size_t GROUP_SIZE = Codec::template calc_num_fields<Group>();
        Group p0 = Codec::template deserialize_from_fields<Group>(limbs.template subspan<0, GROUP_SIZE>());
        Group p1 = Codec::template deserialize_from_fields<Group>(limbs.template subspan<GROUP_SIZE, GROUP_SIZE>());
        return PairingPoints(p0, p1);
    }

    // Iterator support (used by validate_context to extract Builder* from the contained group elements)
    auto begin() { return _points.begin(); }
    auto end() { return _points.end(); }
    auto begin() const { return _points.begin(); }
    auto end() const { return _points.end(); }

    /**
     * @brief Aggregate multiple PairingPoints using random linear combination
     *
     * @details Computes: P_agg = P₀ + r₁·P₁ + r₂·P₂ + ... + rₙ₋₁·Pₙ₋₁ where r₁,...,rₙ₋₁ are 128-bit challenges
     * depending on all input points.
     *
     * @param pairing_points Vector of pairing points to aggregate (requires size > 1)
     * @param handle_edge_cases If true, batch_mul handles edge cases where points might be zero or challenges might
     * cause numerical issues. If false, assumes all points are non-zero and non-colliding (saves circuit gates).
     *
     * Safety of handle_edge_cases=false:
     * - Safe when all points are verifier-computed (deterministic, won't collide)
     * - Safe even with untrusted public input points, as the random challenges make collisions negligible
     * - Provides significant circuit gate savings in recursive verification
     */
    static PairingPoints aggregate_multiple(std::vector<PairingPoints>& pairing_points, bool handle_edge_cases = true)
    {
        size_t num_points = pairing_points.size();
        BB_ASSERT_GT(num_points, 0UL, "Must provide at least one PairingPoints for aggregation");
        if (num_points == 1) {
            return pairing_points[0];
        }

        std::vector<Group> first_components;
        first_components.reserve(num_points);
        std::vector<Group> second_components;
        second_components.reserve(num_points);
        for (const auto& points : pairing_points) {
            first_components.emplace_back(points.P0());
            second_components.emplace_back(points.P1());
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
        Group P0;
        Group P1;

        // For MegaCircuitBuilder (Goblin): batch_mul optimizes constant scalar 1 (uses add instead of mul)
        // so we can include all points in a single batch_mul with scalar [1, r₁, r₂, ..., rₙ₋₁]
        // For UltraCircuitBuilder: no optimization for witness point × constant(1), so keep first point separate
        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            // Single batch_mul for all points (efficient for Goblin with constant scalar 1)
            std::vector<Fr> scalars;
            scalars.reserve(num_points);
            scalars.push_back(Fr(1)); // Optimized by Goblin: add instead of mul
            scalars.insert(scalars.end(), challenges.begin(), challenges.end());

            P0 = Group::batch_mul(first_components, scalars);
            P1 = Group::batch_mul(second_components, scalars);
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
     * @brief Aggregate another PairingPoints into this one via random linear combination.
     * @details Computes: this = this + r · other, where r is a 128-bit Fiat-Shamir challenge depending on
     * both sets of points. If this is unpopulated (default-constructed), simply copies other.
     *
     * @param other The PairingPoints to aggregate (must be populated).
     */
    void aggregate(PairingPoints const& other)
    {
        BB_ASSERT(other.has_data_, "Cannot aggregate null pairing points.");

        // If LHS is empty, simply set it equal to the incoming pairing points
        if (!this->has_data_ && other.has_data_) {
            *this = other;
            return;
        }
        // Use transcript to hash all four points to derive a binding challenge
        StdlibTranscript<Builder> transcript{};
        transcript.add_to_hash_buffer("Accumulator_P0", P0());
        transcript.add_to_hash_buffer("Accumulator_P1", P1());
        transcript.add_to_hash_buffer("Aggregated_P0", other.P0());
        transcript.add_to_hash_buffer("Aggregated_P1", other.P1());
        auto recursion_separator =
            transcript.template get_challenge<typename Curve::ScalarField>("recursion_separator");
        is_default_ = false; // After aggregation, points are no longer default
        // If Mega Builder is in use, the EC operations are deferred via Goblin.
        // batch_mul with constant scalar 1 is optimal here (Goblin uses add instead of mul).
        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            // Goblin: batch_mul with constant scalar 1 uses add instead of mul
            _points[0] = Group::batch_mul({ P0(), other.P0() }, { 1, recursion_separator });
            _points[1] = Group::batch_mul({ P1(), other.P1() }, { 1, recursion_separator });
        } else {
            // Ultra: 128-bit scalar mul to save gates
            Group point_to_aggregate = other.P0().scalar_mul(recursion_separator, 128);
            _points[0] += point_to_aggregate;
            point_to_aggregate = other.P1().scalar_mul(recursion_separator, 128);
            _points[1] += point_to_aggregate;
        }

        // Merge the tags in the builder
        Builder* builder = P0().get_context();
        if (builder != nullptr) {
            builder->pairing_points_tagging.merge_pairing_point_tags(this->tag_index, other.tag_index);
        }

#ifndef NDEBUG
        bb::PairingPoints<typename Curve::NativeCurve> native_pp(P0().get_value(), P1().get_value());
        info("Are aggregated Pairing Points with tag ", tag_index, " valid? ", native_pp.check() ? "true" : "false");
#endif
    }

    /**
     * @brief Set the witness indices for the pairing points to public
     * @details For default (infinity) pairing points, uses set_default_to_public which directly adds zero limbs
     * as public inputs, bypassing bigfield::set_public() which cannot handle constant-coordinate infinity points.
     * @param ctx Optional builder context; required for default pairing points which have no circuit context.
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    uint32_t set_public(Builder* ctx = nullptr)
    {
        BB_ASSERT(this->has_data_, "Calling set_public on empty pairing points.");
        if (is_default_) {
            Builder* builder = validate_context<Builder>(ctx, P0().get_context(), P1().get_context());
            BB_ASSERT(builder != nullptr, "set_public on default pairing points requires a builder context.");
            return set_default_to_public(builder);
        }
        Builder* builder = validate_context<Builder>(ctx, P0().get_context(), P1().get_context());
        builder->pairing_points_tagging.set_public_pairing_points();
        uint32_t start_idx = P0().set_public();
        P1().set_public();
        return start_idx;
    }

    /**
     * @brief Record the witness values of pairing points' coordinates in the selectors
     */
    void fix_witness()
    {
        BB_ASSERT(this->has_data_, "Calling fix_witness on empty pairing points.");
        _points[0].fix_witness();
        _points[1].fix_witness();
    }

    /**
     * @brief Perform native pairing check on the witness values
     * @details Extracts native values from P0 and P1 and performs the pairing verification.
     */
    bool check() const
    {
        BB_ASSERT(this->has_data_, "Calling check on empty pairing points.");
        bb::PairingPoints<typename Curve::NativeCurve> native_pp(P0().get_value(), P1().get_value());
        return native_pp.check();
    }

    /**
     * @brief Set the witness indices for the default (infinity) pairing points to public.
     * @details Optimized version that directly sets zero Fr limb values as public inputs, avoiding expensive bigfield
     * operations. The default pairing points are at infinity, which trivially satisfies the pairing equation
     *
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    static uint32_t set_default_to_public(Builder* builder)
    {
        builder->pairing_points_tagging.set_public_pairing_points();
        // Infinity is represented as (0,0) in biggroup. Directly add zero limbs as public inputs, bypassing bigfield's
        // self_reduce.
        uint32_t start_idx = static_cast<uint32_t>(builder->num_public_inputs());
        for (size_t i = 0; i < PUBLIC_INPUTS_SIZE; i++) {
            uint32_t idx = builder->add_public_variable(bb::fr(0));
            builder->fix_witness(idx, bb::fr(0));
        }
        return start_idx;
    }

    /**
     * @brief Construct default pairing points (both at infinity).
     * @details The point at infinity trivially satisfies the pairing equation: e(∞, Q) = 1.
     */
    static PairingPoints construct_default()
    {
        Group P0(Fq(0), Fq(0), /*assert_on_curve=*/false);
        Group P1(Fq(0), Fq(0), /*assert_on_curve=*/false);
        PairingPoints pp(P0, P1);
        pp.is_default_ = true;
        return pp;
    }

  private:
    std::array<Group, 2> _points;
    bool has_data_ = false;
    bool is_default_ = false; // True for default (infinity) pairing points from construct_default()
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, PairingPoints<NCT> const& as)
{
    return os << "P0: " << as.P0() << "\n"
              << "P1: " << as.P1() << "\n"
              << "is_populated: " << as.is_populated() << "\n"
              << "tag_index: " << as.tag_index << "\n";
}

} // namespace bb::stdlib::recursion
