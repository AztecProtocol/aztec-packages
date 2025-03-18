#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct FieldGreaterThanEvent {
    FF a;
    FF b;
};

} // namespace bb::avm2::simulation
