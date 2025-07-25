#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <sys/types.h>
#include <utility>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"
#include "barretenberg/vm2/simulation/siloing.hpp"
#include "barretenberg/vm2/simulation/update_check.hpp"

namespace bb::avm2::simulation {

struct BytecodeNotFoundError : public std::runtime_error {
    BytecodeNotFoundError(const std::string& message)
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
    virtual ContractClassId get_bytecode(const AztecAddress& address) = 0;
    // Retrieves an instruction and decomposes it if needed.
    virtual Instruction read_instruction(ContractClassId class_id, uint32_t pc) = 0;
};

class TxBytecodeManager : public TxBytecodeManagerInterface {
  public:
    TxBytecodeManager(ContractDBInterface& contract_db,
                      HighLevelMerkleDBInterface& merkle_db,
                      Poseidon2Interface& poseidon2,
                      BytecodeHashingInterface& bytecode_hasher,
                      RangeCheckInterface& range_check,
                      ContractInstanceManagerInterface& contract_instance_manager,
                      EventEmitterInterface<BytecodeRetrievalEvent>& retrieval_events,
                      EventEmitterInterface<BytecodeDecompositionEvent>& decomposition_events,
                      EventEmitterInterface<InstructionFetchingEvent>& fetching_events)
        : contract_db(contract_db)
        , merkle_db(merkle_db)
        , poseidon2(poseidon2)
        , bytecode_hasher(bytecode_hasher)
        , range_check(range_check)
        , contract_instance_manager(contract_instance_manager)
        , retrieval_events(retrieval_events)
        , decomposition_events(decomposition_events)
        , fetching_events(fetching_events)
    {}

    ContractClassId get_bytecode(const AztecAddress& address) override;
    Instruction read_instruction(ContractClassId class_id, uint32_t pc) override;

  private:
    ContractDBInterface& contract_db;
    HighLevelMerkleDBInterface& merkle_db;
    Poseidon2Interface& poseidon2;
    BytecodeHashingInterface& bytecode_hasher;
    RangeCheckInterface& range_check;
    ContractInstanceManagerInterface& contract_instance_manager;
    EventEmitterInterface<BytecodeRetrievalEvent>& retrieval_events;
    EventEmitterInterface<BytecodeDecompositionEvent>& decomposition_events;
    EventEmitterInterface<InstructionFetchingEvent>& fetching_events;
    unordered_flat_map<ContractClassId, std::shared_ptr<std::vector<uint8_t>>> bytecodes;
};

// Manages the bytecode of a single nested call.
// Mostly a wrapper around a TxBytecodeManager.
class BytecodeManagerInterface {
  public:
    virtual ~BytecodeManagerInterface() = default;

    virtual Instruction read_instruction(uint32_t pc) = 0;
    // Returns the class id of the current contract. Tries to fetch it if not already done.
    virtual ContractClassId get_class_id() = 0;
};

class BytecodeManager : public BytecodeManagerInterface {
  public:
    BytecodeManager(AztecAddress address, TxBytecodeManagerInterface& tx_bytecode_manager)
        : address(address)
        , tx_bytecode_manager(tx_bytecode_manager)
    {}

    Instruction read_instruction(uint32_t pc) override
    {
        return tx_bytecode_manager.read_instruction(get_class_id(), pc);
    }
    ContractClassId get_class_id() override
    {
        if (!class_id.has_value()) {
            class_id = tx_bytecode_manager.get_bytecode(address);
        }
        return class_id.value();
    }

  private:
    AztecAddress address;
    std::optional<ContractClassId> class_id;
    TxBytecodeManagerInterface& tx_bytecode_manager;
};

} // namespace bb::avm2::simulation
