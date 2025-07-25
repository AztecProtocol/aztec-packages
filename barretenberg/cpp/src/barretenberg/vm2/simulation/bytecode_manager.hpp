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
#include "barretenberg/vm2/simulation/siloing.hpp"
#include "barretenberg/vm2/simulation/update_check.hpp"

namespace bb::avm2::simulation {

struct BytecodeNotFoundError : public std::runtime_error {
    BytecodeNotFoundError(const AztecAddress& address, const std::string& message)
        : std::runtime_error(message)
        , address(address)
    {}

    AztecAddress address;
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

    // Retrieves an instruction and decomposes/hashes bytecode if needed.
    // This combines the previous get_bytecode and read_instruction operations.
    virtual Instruction read_instruction(const AztecAddress& address, uint32_t pc) = 0;
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

    Instruction read_instruction(const AztecAddress& address, uint32_t pc) override;

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

    // Cache bytecode by address to avoid re-retrieval
    unordered_flat_map<AztecAddress, std::shared_ptr<std::vector<uint8_t>>> bytecodes;

    // Helper method to retrieve and cache bytecode for an address
    std::shared_ptr<std::vector<uint8_t>> get_bytecode_for_address(const AztecAddress& address);
};

// Manages the bytecode of a single nested call.
// Mostly a wrapper around a TxBytecodeManager.
class BytecodeManagerInterface {
  public:
    virtual ~BytecodeManagerInterface() = default;

    virtual Instruction read_instruction(uint32_t pc) = 0;
};

class BytecodeManager : public BytecodeManagerInterface {
  public:
    BytecodeManager(AztecAddress address, TxBytecodeManagerInterface& tx_bytecode_manager)
        : address(address)
        , tx_bytecode_manager(tx_bytecode_manager)
    {}

    Instruction read_instruction(uint32_t pc) override { return tx_bytecode_manager.read_instruction(address, pc); }

  private:
    AztecAddress address;
    TxBytecodeManagerInterface& tx_bytecode_manager;
};

} // namespace bb::avm2::simulation
