#pragma once

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

enum class SiloingType { NULLIFIER };

struct SiloingEvent {
    SiloingType type;
    FF elem;
    FF siloed_by;
    FF siloed_elem;
};

} // namespace bb::avm2::simulation