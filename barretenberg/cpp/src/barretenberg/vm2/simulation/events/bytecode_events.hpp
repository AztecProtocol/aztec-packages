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

// Storage and decomposition of bytecode into sliding window.
// Deduplicates by bytecode commitment since it's known from the DB
struct BytecodeDecompositionEvent {
    FF bytecode_commitment;
    std::shared_ptr<std::vector<uint8_t>> bytecode;

    // To be used with deduplicating event emitters.
    using Key = FF;
    Key get_key() const { return bytecode_commitment; }
};

// Deduplicates by bytecode commitment since that's what we're computing
struct BytecodeHashingEvent {
    FF bytecode_commitment;
    uint32_t bytecode_length;
    std::vector<FF> bytecode_fields;

    // To be used with deduplicating event emitters.
    using Key = FF;
    Key get_key() const { return bytecode_commitment; }
};

// This is the event that is emitted when the simulator needs to retrieve bytecode.
// It might or might not result into the storage/decomposition of a bytecode.
struct BytecodeRetrievalEvent {
    AztecAddress address;
    ContractClassId current_class_id;
    ContractClass contract_class;
    FF nullifier_root;
    FF public_data_tree_root;
    bool error = false;

    // To be used with deduplicating event emitters.
    using Key = AztecAddress;
    Key get_key() const { return address; }
};

// Deduplicates by contract address and PC since that's the natural key
struct InstructionFetchingEvent {
    AztecAddress address;
    uint32_t pc;
    // TODO: Do we want to have a dep on Instruction here or do we redefine what we need?
    Instruction instruction;
    std::shared_ptr<std::vector<uint8_t>> bytecode;
    std::optional<InstrDeserializationError> error;

    // To be used with deduplicating event emitters.
    using Key = std::tuple<AztecAddress, uint32_t>;
    Key get_key() const { return { address, pc }; }
};

} // namespace bb::avm2::simulation
