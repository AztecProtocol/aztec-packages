#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct ClassIdDerivationEvent {
    // Uses ContractClassWithCommitment which includes id and bytecode_commitment
    ContractClassWithCommitment klass;
};

} // namespace bb::avm2::simulation