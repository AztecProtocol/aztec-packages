#pragma once

#include <cstdint>
#include <memory>
#include <span>
#include <sys/types.h>
#include <utility>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_db.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

using BytecodeId = uint32_t;

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
    // Retrieves the class id of a bytecode, in case you need it.
    virtual ContractClassId get_class_id(BytecodeId bytecode_id) const = 0;
};

class TxBytecodeManager : public TxBytecodeManagerInterface {
  public:
    TxBytecodeManager(RawDataDBInterface& db,
                      EventEmitterInterface<BytecodeHashingEvent>& hash_events,
                      EventEmitterInterface<BytecodeDecompositionEvent>& decomposition_events)
        : db(db)
        , hash_events(hash_events)
        , decomposition_events(decomposition_events)
    {}

    BytecodeId get_bytecode(const AztecAddress& address) override;
    Instruction read_instruction(BytecodeId bytecode_id, uint32_t pc) override;
    ContractClassId get_class_id(BytecodeId bytecode_id) const override;

  private:
    struct BytecodeInfo {
        std::shared_ptr<std::vector<uint8_t>> bytecode;
        ContractClassId class_id;
    };

    RawDataDBInterface& db;
    EventEmitterInterface<BytecodeHashingEvent>& hash_events;
    EventEmitterInterface<BytecodeDecompositionEvent>& decomposition_events;
    unordered_flat_map<BytecodeId, const BytecodeInfo> bytecodes;
    unordered_flat_map<AztecAddress, BytecodeId> resolved_addresses;
    BytecodeId next_bytecode_id = 0;
};

// Manages the bytecode of a single nested call.
// Mostly a wrapper around a TxBytecodeManager.
class BytecodeManagerInterface {
  public:
    virtual ~BytecodeManagerInterface() = default;

    virtual Instruction read_instruction(uint32_t pc) const = 0;
    virtual ContractClassId get_class_id() const = 0;
};

class BytecodeManager : public BytecodeManagerInterface {
  public:
    BytecodeManager(BytecodeId bytecode_id, TxBytecodeManagerInterface& tx_bytecode_manager)
        : bytecode_id(bytecode_id)
        , tx_bytecode_manager(tx_bytecode_manager)
    {}

    Instruction read_instruction(uint32_t pc) const override
    {
        return tx_bytecode_manager.read_instruction(bytecode_id, pc);
    }
    ContractClassId get_class_id() const override { return tx_bytecode_manager.get_class_id(bytecode_id); }

  private:
    BytecodeId bytecode_id;
    TxBytecodeManagerInterface& tx_bytecode_manager;
};

} // namespace bb::avm2::simulation