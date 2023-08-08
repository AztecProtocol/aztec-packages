#pragma once
#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../field/field.hpp"
#include "barretenberg/ecc/curves/types.hpp"

namespace proof_system::plonk {
namespace stdlib {

template <typename CircuitBuilder> struct bn254 {
    static constexpr proof_system::CurveType type = proof_system::CurveType::BN254;

    // NOTE: Naming in flux here; maybe name should reflect "native" somehow?
    using BaseField = curve::BN254::BaseField;
    using fq = BaseField;
    using ScalarField = curve::BN254::ScalarField;
    using fr = ScalarField;
    using Group = curve::BN254::Group;
    using g1 = Group;

    using Builder = CircuitBuilder;
    using Composer = CircuitBuilder;
    using witness_ct = witness_t<CircuitBuilder> ;
    using public_witness_ct = public_witness_t<CircuitBuilder> ;
    using fr_ct = field_t<CircuitBuilder> ;
    using byte_array_ct = byte_array<CircuitBuilder> ;
    using bool_ct = bool_t<CircuitBuilder> ;
    using uint32_ct = stdlib::uint32<CircuitBuilder> ;

    using fq_ct = bigfield<CircuitBuilder, barretenberg::Bn254FqParams> ;
    using bigfr_ct = bigfield<CircuitBuilder, barretenberg::Bn254FrParams> ;
    using g1_ct = element<CircuitBuilder, fq_ct, fr_ct, Group> ;
    using g1_bigfr_ct = element<CircuitBuilder, fq_ct, bigfr_ct, Group> ;

}; // namespace bn254
} // namespace stdlib
} // namespace proof_system::plonk
