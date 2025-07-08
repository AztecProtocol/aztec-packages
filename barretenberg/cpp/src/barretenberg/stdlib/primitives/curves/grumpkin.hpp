// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../field/field.hpp"
#include "../uint/uint.hpp"
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

    // Required by SmallSubgroupIPA argument
    static constexpr size_t SUBGROUP_SIZE = 87;
    // To find the generator below, we factored r - 1 into primes, where r is the modulus of the Grumkin scalar field,
    // sampled a random field element, raised it to (r-1)/(3*29), and ensured that the resulting element is
    // not generating a smaller subgroup. To avoid inversion in the recursive verifier, we also store its inverse.
    static constexpr bb::fq subgroup_generator =
        bb::fq("0x147c647c09fb639514909e9f0513f31ec1a523bf8a0880bc7c24fbc962a9586b");
    static constexpr bb::fq subgroup_generator_inverse =
        bb::fq("0x0c68e27477b5e78cfab790bd3b59806fa871771f71ec7452cde5384f6e3a1988");
    // The length of the polynomials used to mask the Sumcheck Round Univariates. In the ECCVM Sumcheck, the prover only
    // sends 3 elements in every round - a commitment to the round univariate and its evaluations at 0 and 1. Therefore,
    // length 3 is sufficient.
    static constexpr uint32_t LIBRA_UNIVARIATES_LENGTH = 3;
};

} // namespace bb::stdlib
