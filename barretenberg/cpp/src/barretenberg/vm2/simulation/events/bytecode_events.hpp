#pragma once

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// Question: ideally we'd avoid exploding the whole thing here, but we could if needed to.
// It really depends on how we want to separate the concerns between simulation and tracegen.
// And wether we want to allow events to explode vertically in tracegen.
struct BytecodeHashingEvent {
    ContractClassId class_id;
    std::shared_ptr<std::vector<uint8_t>> bytecode;
    FF hash;
};

// WARNING: These events and the above will be "linked" by the bytecode column (1 byte per row).
// Therefore, when generating the trace from this event, it will be absolutely necessary
// to know where the first row of the bytecode is. That presents design challenges.
// Question: consider processing in tandem?
struct BytecodeDecompositionEvent {
    ContractClassId class_id;
    uint32_t pc;
    // TODO: Do we want to have a dep on Instruction here or do we redefine what we need?
    Instruction instruction;
};

} // namespace bb::avm2::simulation