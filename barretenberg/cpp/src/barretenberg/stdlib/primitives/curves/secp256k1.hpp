// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "../bigfield/bigfield.hpp"
#include "../biggroup/biggroup.hpp"
#include "../field/field.hpp"

#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"

namespace bb::stdlib {

template <typename CircuitType> struct secp256k1 {
    static constexpr bb::CurveType type = bb::CurveType::SECP256K1;
    static constexpr bool is_stdlib_type = true;

    // Native types
    using ScalarFieldNative = ::bb::secp256k1::fr;
    using BaseFieldNative = ::bb::secp256k1::fq;
    using GroupNative = ::bb::secp256k1::g1;
    using ElementNative = GroupNative::element;
    using AffineElementNative = GroupNative::affine_element;

    // Stdlib types
    using ScalarField = bigfield<CircuitType, typename ::bb::secp256k1::FrParams>;
    using BaseField = bigfield<CircuitType, typename ::bb::secp256k1::FqParams>;
    using Group = element<CircuitType, BaseField, ScalarField, GroupNative>;
    using Element = Group;
    using AffineElement = Group;

    using Builder = CircuitType;
};
} // namespace bb::stdlib
