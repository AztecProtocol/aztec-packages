// WARNING: Use this field definition only for simulation and tracegen.
// In the constraints we need to use the Flavor so that it works well with recursion.
#pragma once

#include "barretenberg/vm2/common/standard_affine_point.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"

namespace bb::avm2 {

using FF = AvmFlavorSettings::FF;
using Fq = AvmFlavorSettings::G1::Fq;
using EmbeddedCurvePoint = StandardAffinePoint<AvmFlavorSettings::EmbeddedCurve::AffineElement>;

} // namespace bb::avm2
