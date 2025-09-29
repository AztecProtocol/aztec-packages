#pragma once

#include <memory>
#include <optional>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// Manages the bytecode operations of all calls in a transaction.
// In particular, it will not duplicate hashing and decomposition.
class TxBytecodeManagerInterface {
  public:
    virtual ~TxBytecodeManagerInterface() = default;

    // Retrieves the bytecode and
    // (1) sets up the address-class id connection,
    // (2) hashes it if needed.
    virtual BytecodeId get_bytecode(const AztecAddress& address) = 0;
    virtual std::shared_ptr<std::vector<uint8_t>> get_bytecode_data(const BytecodeId& bytecode_id) = 0;
    // Retrieves an instruction and decomposes it if needed.
    virtual Instruction read_instruction(const BytecodeId& bytecode_id, uint32_t pc) = 0;
    virtual Instruction read_instruction(const BytecodeId& bytecode_id,
                                         std::shared_ptr<std::vector<uint8_t>> bytecode_ptr,
                                         uint32_t pc) = 0;
};

// Manages the bytecode of a single nested call. Therefore always the same bytecode.
// Mostly a wrapper around a TxBytecodeManager.
class BytecodeManagerInterface {
  public:
    virtual ~BytecodeManagerInterface() = default;

    virtual Instruction read_instruction(uint32_t pc) = 0;

    // Returns the id of the current bytecode. Tries to fetch it if not already done.
    // Throws BytecodeNotFoundError if contract does not exist.
    virtual BytecodeId get_bytecode_id() = 0;

    // Returns the id of the current bytecode if it has been retrieved, std::nullopt otherwise.
    // Won't try to retrieve the bytecode.
    virtual std::optional<BytecodeId> get_retrieved_bytecode_id() = 0;
};

struct BytecodeRetrievalError : public std::runtime_error {
    BytecodeRetrievalError(const std::string& message)
        : std::runtime_error(message)
    {}
};

struct InstructionFetchingError : public std::runtime_error {
    InstructionFetchingError(const std::string& message)
        : std::runtime_error(message)
    {}
};

} // namespace bb::avm2::simulation
