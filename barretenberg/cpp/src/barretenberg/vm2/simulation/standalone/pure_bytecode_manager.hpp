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
#include "barretenberg/vm2/common/set.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/interfaces/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// Forward declaration.
class ContractInstanceManagerInterface;
class ContractDBInterface;

class PureTxBytecodeManager : public TxBytecodeManagerInterface {
  public:
    PureTxBytecodeManager(ContractDBInterface& contract_db, ContractInstanceManagerInterface& contract_instance_manager)
        : contract_db(contract_db)
        , contract_instance_manager(contract_instance_manager)
    {}
    ~PureTxBytecodeManager() override;

    BytecodeId get_bytecode(const AztecAddress& address) override;
    std::shared_ptr<std::vector<uint8_t>> get_bytecode_data(const BytecodeId& bytecode_id) override;
    Instruction read_instruction(const BytecodeId& bytecode_id, uint32_t pc) override;
    Instruction read_instruction(const BytecodeId& bytecode_id,
                                 std::shared_ptr<std::vector<uint8_t>> bytecode_ptr,
                                 uint32_t pc) override;

  private:
    ContractDBInterface& contract_db;
    ContractInstanceManagerInterface& contract_instance_manager;

    unordered_flat_map<BytecodeId, std::shared_ptr<std::vector<uint8_t>>> bytecodes;
    unordered_flat_set<ContractClassId> retrieved_class_ids;
    using InstructionIdentifier = std::tuple</*bytecode_vector*/ void*, /*pc*/ uint32_t>;
    unordered_flat_map<InstructionIdentifier, Instruction> instruction_cache;
};

} // namespace bb::avm2::simulation
