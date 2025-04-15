#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct ClassIdDerivationEvent {
    ContractClassId class_id;
    // WARNING: this class has the whole bytecode. Create a new class.
    ContractClass klass;
};

} // namespace bb::avm2::simulation