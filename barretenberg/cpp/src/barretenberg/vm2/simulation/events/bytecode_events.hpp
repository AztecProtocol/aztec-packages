#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// Storage and decomposition of bytecode into sliding window.
struct BytecodeDecompositionEvent {
    BytecodeId bytecode_id = 0;
    std::shared_ptr<std::vector<uint8_t>> bytecode;
};

struct BytecodeHashingEvent {
    BytecodeId bytecode_id = 0;
    uint32_t bytecode_length_in_bytes = 0;
    std::vector<FF> bytecode_fields;
};

enum class BytecodeRetrievalEventError : uint8_t {
    INSTANCE_NOT_FOUND,
    TOO_MANY_BYTECODES,
};

// This is the event that is emitted when the simulator needs to retrieve bytecode.
// It might or might not result into the storage/decomposition of a bytecode.
struct BytecodeRetrievalEvent {
    BytecodeId bytecode_id = 0;
    AztecAddress address = 0;
    ContractClassId current_class_id = 0;
    ContractClass contract_class{};
    FF nullifier_tree_root = 0;
    FF public_data_tree_root = 0;
    AppendOnlyTreeSnapshot retrieved_bytecodes_snapshot_before;
    AppendOnlyTreeSnapshot retrieved_bytecodes_snapshot_after;
    bool is_new_class = false;
    std::optional<BytecodeRetrievalEventError> error;
};

// Emitted when the simulator fetches an instruction from bytecode.
// Contains data required to prove either success or failure of extraction.
struct InstructionFetchingEvent {
    BytecodeId bytecode_id = 0;
    PC pc = 0;
    Instruction instruction;
    std::shared_ptr<std::vector<uint8_t>> bytecode;
    std::optional<InstrDeserializationEventError> error;

    // To be used with deduplicating event emitters.
    using Key = std::tuple<BytecodeId, PC>;
    Key get_key() const { return { bytecode_id, pc }; }
};

} // namespace bb::avm2::simulation
