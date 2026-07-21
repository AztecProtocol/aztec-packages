#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct ClassIdDerivationEvent {
    ContractClassId class_id = 0;
    FF artifact_hash = 0;
    FF private_functions_root = 0;
    BytecodeId public_bytecode_commitment = 0;
};

} // namespace bb::avm2::simulation
