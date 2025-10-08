// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../field/field.hpp"

#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"

namespace bb::stdlib {

template <typename CircuitType> struct secp256r1 {
    static constexpr bb::CurveType type = bb::CurveType::SECP256R1;

    using fq = bb::secp256r1::fq;
    using fr = bb::secp256r1::fr;
    using g1 = bb::secp256r1::g1;

    // Native types
    using ScalarFieldNative = ::bb::secp256r1::fr;
    using BaseFieldNative = ::bb::secp256r1::fq;
    using GroupNative = ::bb::secp256r1::g1;
    using ElementNative = GroupNative::element;
    using AffineElementNative = GroupNative::affine_element;

    // Stdlib types
    using ScalarField = bigfield<CircuitType, typename ::bb::secp256r1::FrParams>;
    using BaseField = bigfield<CircuitType, typename ::bb::secp256r1::FqParams>;
    using Group = element<CircuitType, BaseField, ScalarField, GroupNative>;
    using Element = Group;
    using AffineElement = Group;

    using Builder = CircuitType;
    using witness_ct = witness_t<Builder>;
    using public_witness_ct = public_witness_t<Builder>;
    using fr_ct = field_t<Builder>;
    using byte_array_ct = byte_array<Builder>;
    using bool_ct = bool_t<Builder>;

    using fq_ct = bigfield<Builder, typename bb::secp256r1::FqParams>;
    using bigfr_ct = bigfield<Builder, typename bb::secp256r1::FrParams>;
    using g1_ct = element<Builder, fq_ct, fr_ct, g1>;
    using g1_bigfr_ct = element<Builder, fq_ct, bigfr_ct, g1>;
};
} // namespace bb::stdlib
