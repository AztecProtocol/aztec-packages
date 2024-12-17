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
    static constexpr bool is_stdlib_type = true;
    using Builder = CircuitBuilder;
    using NativeCurve = curve::Grumpkin;

    // Stdlib types corresponding to those defined in the native description of the curve.
    // Note: its useful to have these type names match the native analog exactly so that components that digest a
    // Curve (e.g. the PCS) can be agnostic as to whether they're operating on native or stdlib types.
    using ScalarField = bigfield<Builder, bb::Bn254FqParams>;
    using BaseField = field_t<Builder>;
    using Group = cycle_group<Builder>;
    using AffineElement = Group;
    using Element = Group;

    // Additional types with no analog in the native description of the curve
    using witness_ct = witness_t<CircuitBuilder>;
    using public_witness_ct = public_witness_t<CircuitBuilder>;
    using byte_array_ct = byte_array<CircuitBuilder>;
    using bool_ct = bool_t<CircuitBuilder>;
    using uint32_ct = stdlib::uint32<CircuitBuilder>;
    static constexpr size_t SUBGROUP_SIZE = 87;
    static const ScalarField SUBGROUP_GENERATOR;
};

template <typename BuilderType>
const typename grumpkin<BuilderType>::ScalarField grumpkin<BuilderType>::SUBGROUP_GENERATOR =
    typename grumpkin<BuilderType>::ScalarField(
        uint256_t("0x147c647c09fb639514909e9f0513f31ec1a523bf8a0880bc7c24fbc962a9586b"));

} // namespace bb::stdlib