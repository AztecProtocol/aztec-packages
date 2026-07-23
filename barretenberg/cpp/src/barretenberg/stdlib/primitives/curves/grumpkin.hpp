// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../field/field.hpp"
#include "barretenberg/ecc/curves/types.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace bb::stdlib {

/**
 * @brief Curve grumpkin in circuit setting
 *
 * @tparam CircuitBuilder The type of builder the curve is going to be used within
 */
template <typename CircuitBuilder> struct grumpkin {
    static constexpr bb::CurveType type = bb::CurveType::GRUMPKIN;
    static constexpr bool is_stdlib_type = true;
    using NativeCurve = curve::Grumpkin;

    // Corresponding native types (used exclusively for testing)
    using ScalarFieldNative = curve::Grumpkin::ScalarField;
    using BaseFieldNative = curve::Grumpkin::BaseField;
    using GroupNative = curve::Grumpkin::Group;
    using ElementNative = GroupNative::element;
    using AffineElementNative = GroupNative::affine_element;

    // Stdlib types corresponding to those defined in the native description of the curve.
    // Note: its useful to have these type names match the native analog exactly so that components that digest a
    // Curve (e.g. the PCS) can be agnostic as to whether they're operating on native or stdlib types.
    using ScalarField = bigfield<CircuitBuilder, bb::Bn254FqParams>;
    using BaseField = field_t<CircuitBuilder>;
    using Group = cycle_group<CircuitBuilder>;
    using AffineElement = Group;
    using Element = Group;

    // Additional types with no analog in the native description of the curve
    using Builder = CircuitBuilder;

    // Required by SmallSubgroupIPA argument. This constant needs to divide the size of the multiplicative subgroup of
    // the ScalarField and accommodate the concatenated Libra polynomial:
    // SUBGROUP_SIZE > CONST_ECCVM_LOG_N * LIBRA_UNIVARIATES_LENGTH + 1 = 15 * 4 + 1 = 61.
    static constexpr size_t SUBGROUP_SIZE = 87;
    // The generator below was derived by factoring r - 1 into primes, where r is the modulus of the Grumkin scalar
    // field. A random field element was sampled and raised to the power (r - 1) / (3 * 29). We verified that the
    // resulting element does not generate a smaller subgroup by further raising it to the powers of 3 and 29. To
    // optimize the recursive verifier and avoid costly inversions, we also precompute and store its inverse.
    static constexpr bb::fq subgroup_generator =
        bb::fq("0x147c647c09fb639514909e9f0513f31ec1a523bf8a0880bc7c24fbc962a9586b");
    static constexpr bb::fq subgroup_generator_inverse =
        bb::fq("0x0c68e27477b5e78cfab790bd3b59806fa871771f71ec7452cde5384f6e3a1988");
    // The length of the polynomials used to mask the Sumcheck Round Univariates in the committed (ECCVM) sumcheck.
    // Must match the native curve::Grumpkin::LIBRA_UNIVARIATES_LENGTH; see the rationale there and in
    // sumcheck/docs/committed_sumcheck_zk.md.
    static constexpr uint32_t LIBRA_UNIVARIATES_LENGTH = 4;
};

} // namespace bb::stdlib
