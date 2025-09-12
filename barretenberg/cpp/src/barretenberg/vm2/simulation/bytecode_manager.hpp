#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <sys/types.h>
#include <utility>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"
#include "barretenberg/vm2/simulation/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/siloing.hpp"
#include "barretenberg/vm2/simulation/update_check.hpp"

namespace bb::avm2::simulation {

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

// Manages the bytecode operations of all calls in a transaction.
// In particular, it will not duplicate hashing and decomposition.
class TxBytecodeManagerInterface {
  public:
    virtual ~TxBytecodeManagerInterface() = default;

    // Retrieves the bytecode and
    // (1) sets up the address-class id connection,
    // (2) hashes it if needed.
    virtual BytecodeId get_bytecode(const AztecAddress& address) = 0;
    // Retrieves an instruction and decomposes it if needed.
    virtual Instruction read_instruction(BytecodeId bytecode_id, uint32_t pc) = 0;
};

class TxBytecodeManager : public TxBytecodeManagerInterface {
  public:
    TxBytecodeManager(ContractDBInterface& contract_db,
                      HighLevelMerkleDBInterface& merkle_db,
                      BytecodeHashingInterface& bytecode_hasher,
                      RangeCheckInterface& range_check,
                      ContractInstanceManagerInterface& contract_instance_manager,
                      RetrievedBytecodesTreeCheckInterface& retrieved_bytecodes_tree_check,
                      EventEmitterInterface<BytecodeRetrievalEvent>& retrieval_events,
                      EventEmitterInterface<BytecodeDecompositionEvent>& decomposition_events,
                      EventEmitterInterface<InstructionFetchingEvent>& fetching_events)
        : contract_db(contract_db)
        , merkle_db(merkle_db)
        , bytecode_hasher(bytecode_hasher)
        , range_check(range_check)
        , contract_instance_manager(contract_instance_manager)
        , retrieved_bytecodes_tree_check(retrieved_bytecodes_tree_check)
        , retrieval_events(retrieval_events)
        , decomposition_events(decomposition_events)
        , fetching_events(fetching_events)
    {}

    BytecodeId get_bytecode(const AztecAddress& address) override;
    Instruction read_instruction(BytecodeId bytecode_id, uint32_t pc) override;

  private:
    ContractDBInterface& contract_db;
    HighLevelMerkleDBInterface& merkle_db;
    BytecodeHashingInterface& bytecode_hasher;
    RangeCheckInterface& range_check;
    ContractInstanceManagerInterface& contract_instance_manager;
    RetrievedBytecodesTreeCheckInterface& retrieved_bytecodes_tree_check;
    EventEmitterInterface<BytecodeRetrievalEvent>& retrieval_events;
    EventEmitterInterface<BytecodeDecompositionEvent>& decomposition_events;
    EventEmitterInterface<InstructionFetchingEvent>& fetching_events;
    unordered_flat_map<BytecodeId, std::shared_ptr<std::vector<uint8_t>>> bytecodes;
};

// Manages the bytecode of a single nested call.
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

class BytecodeManager : public BytecodeManagerInterface {
  public:
    BytecodeManager(AztecAddress address, TxBytecodeManagerInterface& tx_bytecode_manager)
        : address(address)
        , tx_bytecode_manager(tx_bytecode_manager)
    {}

    Instruction read_instruction(uint32_t pc) override
    {
        return tx_bytecode_manager.read_instruction(get_bytecode_id(), pc);
    }

    BytecodeId get_bytecode_id() override
    {
        if (!bytecode_id.has_value()) {
            bytecode_id = tx_bytecode_manager.get_bytecode(address);
        }
        return bytecode_id.value();
    }

    std::optional<BytecodeId> get_retrieved_bytecode_id() override { return bytecode_id; }

  private:
    AztecAddress address;
    std::optional<BytecodeId> bytecode_id;
    TxBytecodeManagerInterface& tx_bytecode_manager;
};

} // namespace bb::avm2::simulation
