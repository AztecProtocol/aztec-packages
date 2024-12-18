#pragma once
#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../field/field.hpp"
#include "barretenberg/ecc/curves/types.hpp"

namespace bb::stdlib {

template <typename CircuitBuilder> struct bn254 {
    static constexpr bb::CurveType type = bb::CurveType::BN254;
    // TODO(#673): This flag is temporary. It is needed in the verifier classes (GeminiVerifier, etc.) while these
    // classes are instantiated with "native" curve types. Eventually, the verifier classes will be instantiated only
    // with stdlib types, and "native" verification will be acheived via a simulated builder.
    static constexpr bool is_stdlib_type = true;
    using NativeCurve = curve::BN254;

    // Corresponding native types (used exclusively for testing)
    using ScalarFieldNative = curve::BN254::ScalarField;
    using BaseFieldNative = curve::BN254::BaseField;
    using GroupNative = curve::BN254::Group;
    using ElementNative = GroupNative::element;
    using AffineElementNative = GroupNative::affine_element;

    // Stdlib types corresponding to those defined in the native description of the curve.
    // Note: its useful to have these type names match the native analog exactly so that components that digest a Curve
    // (e.g. Gemini) can be agnostic as to whether they're operating on native or stdlib types.
    using ScalarField = field_t<CircuitBuilder>;
    using Group = element<CircuitBuilder, bigfield<CircuitBuilder, bb::Bn254FqParams>, ScalarField, GroupNative>;
    using BaseField = Group::BaseField;
    using Element = Group;
    using AffineElement = Group;

    // Additional types with no analog in the native description of the curve
    using Builder = CircuitBuilder;
    using witness_ct = witness_t<CircuitBuilder>;
    using public_witness_ct = public_witness_t<CircuitBuilder>;
    using byte_array_ct = byte_array<CircuitBuilder>;
    using bool_ct = bool_t<CircuitBuilder>;
    using uint32_ct = stdlib::uint32<CircuitBuilder>;

    using bigfr_ct = bigfield<CircuitBuilder, bb::Bn254FrParams>;
    using g1_bigfr_ct = element<CircuitBuilder, BaseField, bigfr_ct, GroupNative>;

    static constexpr size_t SUBGROUP_SIZE = 87;

    static const ScalarField SUBGROUP_GENERATOR;

}; // namespace bn254

template <typename CircuitBuilder>
const typename bn254<CircuitBuilder>::ScalarField bn254<CircuitBuilder>::SUBGROUP_GENERATOR =
    typename bn254<CircuitBuilder>::ScalarField(
        uint256_t("0e4061303ba140794a3a2d8659909fd6ffb3dfdc290e4d9ca93bccd950f16404"));

} // namespace bb::stdlib
