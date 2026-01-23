#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct ClassIdDerivationEvent {
    // Uses ContractClassWithCommitment which includes id and bytecode_commitment
    // WARNING: this class has the whole bytecode. Create a new class.
    ContractClassWithCommitment klass;
};

} // namespace bb::avm2::simulation
