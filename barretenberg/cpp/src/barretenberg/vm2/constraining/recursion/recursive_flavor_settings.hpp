// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb::avm2 {

struct AvmRecursiveFlavorSettings {
    using CircuitBuilder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using FF = typename Curve::ScalarField;
    using BF = typename Curve::BaseField;
};

} // namespace bb::avm2
