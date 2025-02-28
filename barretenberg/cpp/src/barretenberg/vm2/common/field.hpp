// WARNING: Use this field definition only for simulation and tracegen.
// In the constraints we need to use the Flavor so that it works well with recursion.
#pragma once

#include "barretenberg/vm2/common/standard_affine_point.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"

namespace bb::avm2 {

using FF = AvmFlavorSettings::FF;
using Fq = AvmFlavorSettings::G1::coordinate_field;
// TODO(Alvaro): I think we need grumpkin in the flavor settings
using EmbeddedCurvePoint = StandardAffinePoint<grumpkin::g1>;
} // namespace bb::avm2
