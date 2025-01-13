// WARNING: Use this field definition only for simulation and tracegen.
// In the constraints we need to use the Flavor so that it works well with recursion.
#pragma once

#include "barretenberg/vm2/generated/flavor_settings.hpp"

namespace bb::avm2 {

using FF = AvmFlavorSettings::FF;

} // namespace bb::avm2