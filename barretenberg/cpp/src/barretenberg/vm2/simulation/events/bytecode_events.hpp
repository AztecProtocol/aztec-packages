#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

using BytecodeId = uint8_t;

// TODO: Implement tracegen for this.
struct BytecodeHashingEvent {
    BytecodeId bytecode_id;
    std::shared_ptr<std::vector<uint8_t>> bytecode;
};

struct BytecodeRetrievalEvent {
    BytecodeId bytecode_id;
    AztecAddress address;
    AztecAddress siloed_address;
    ContractInstance contract_instance;
    ContractClass contract_class;
    FF nullifier_root;
    bool error = false;
};

// WARNING: These events and the above will be "linked" by the bytecode column (1 byte per row).
// Therefore, when generating the trace from this event, it will be absolutely necessary
// to know where the first row of the bytecode is. That presents design challenges.
// Question: consider processing in tandem?
struct BytecodeDecompositionEvent {
    BytecodeId bytecode_id;
    uint32_t pc;
    // TODO: Do we want to have a dep on Instruction here or do we redefine what we need?
    Instruction instruction;
};

} // namespace bb::avm2::simulation