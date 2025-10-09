#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/interfaces/get_contract_instance.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

class GetContractInstance : public GetContractInstanceInterface {
  public:
    GetContractInstance(ExecutionIdManagerInterface& execution_id_manager,
                        HighLevelMerkleDBInterface& merkle_db,
                        EventEmitterInterface<GetContractInstanceEvent>& event_emitter,
                        ContractInstanceManagerInterface& instance_manager);

    void get_contract_instance(MemoryInterface& memory,
                               const AztecAddress& contract_address,
                               MemoryAddress dst_offset,
                               uint8_t member_enum) override;

  private:
    ExecutionIdManagerInterface& execution_id_manager;
    HighLevelMerkleDBInterface& merkle_db;
    EventEmitterInterface<GetContractInstanceEvent>& event_emitter;
    ContractInstanceManagerInterface& instance_manager;

    static void write_results(MemoryInterface& memory, MemoryAddress dst_offset, bool exists, const FF& member_value);
    static FF select_instance_member(const ContractInstance& instance, uint8_t member_enum);
};

} // namespace bb::avm2::simulation
