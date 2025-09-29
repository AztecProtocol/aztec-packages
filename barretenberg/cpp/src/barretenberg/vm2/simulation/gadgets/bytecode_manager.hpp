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
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/siloing.hpp"
#include "barretenberg/vm2/simulation/gadgets/update_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

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
    std::shared_ptr<std::vector<uint8_t>> get_bytecode_data(const BytecodeId& bytecode_id) override;
    Instruction read_instruction(const BytecodeId& bytecode_id, uint32_t pc) override;
    Instruction read_instruction(const BytecodeId& bytecode_id,
                                 std::shared_ptr<std::vector<uint8_t>> bytecode_ptr,
                                 uint32_t pc) override;

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

class BytecodeManager : public BytecodeManagerInterface {
  public:
    BytecodeManager(AztecAddress address, TxBytecodeManagerInterface& tx_bytecode_manager)
        : address(address)
        , tx_bytecode_manager(tx_bytecode_manager)
    {}

    Instruction read_instruction(uint32_t pc) override
    {
        auto id = get_bytecode_id();
        return tx_bytecode_manager.read_instruction(id, bytecode_ptr, pc);
    }

    BytecodeId get_bytecode_id() override
    {
        if (!bytecode_id.has_value()) {
            bytecode_id = tx_bytecode_manager.get_bytecode(address);
            bytecode_ptr = tx_bytecode_manager.get_bytecode_data(bytecode_id.value());
        }
        return bytecode_id.value();
    }

    std::optional<BytecodeId> get_retrieved_bytecode_id() override { return bytecode_id; }

  private:
    AztecAddress address;
    std::optional<BytecodeId> bytecode_id;
    std::shared_ptr<std::vector<uint8_t>> bytecode_ptr;
    TxBytecodeManagerInterface& tx_bytecode_manager;
};

} // namespace bb::avm2::simulation
