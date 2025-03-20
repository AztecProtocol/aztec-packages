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

// Storage and decomposition of bytecode into sliding window.
struct BytecodeDecompositionEvent {
    BytecodeId bytecode_id;
    std::shared_ptr<std::vector<uint8_t>> bytecode;
};

struct BytecodeHashingEvent {
    BytecodeId bytecode_id;
    uint32_t bytecode_length;
    std::vector<FF> bytecode_fields;
};

// This is the event that is emitted when the simulator needs to retrieve bytecode.
// It might or might not result into the storage/decomposition of a bytecode.
struct BytecodeRetrievalEvent {
    BytecodeId bytecode_id;
    AztecAddress address;
    AztecAddress siloed_address;
    ContractInstance contract_instance;
    ContractClass contract_class;
    FF nullifier_root;
    bool error = false;
};

enum class InstructionFetchingError : uint8_t {
    NO_ERROR,
    PC_OUT_OF_RANGE,
    OPCODE_OUT_OF_RANGE,
    INSTRUCTION_OUT_OF_RANGE,
};

struct InstructionFetchingEvent {
    BytecodeId bytecode_id;
    uint32_t pc;
    // TODO: Do we want to have a dep on Instruction here or do we redefine what we need?
    Instruction instruction;
    std::shared_ptr<std::vector<uint8_t>> bytecode;
    InstructionFetchingError error = InstructionFetchingError::NO_ERROR;

    // To be used with deduplicating event emitters.
    using Key = std::tuple<BytecodeId, uint32_t>;
    Key get_key() const { return { bytecode_id, pc }; }
};

} // namespace bb::avm2::simulation
