#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct EccAddEvent {
    AffinePoint p;
    AffinePoint q;
    AffinePoint result;
};

} // namespace bb::avm2::simulation
