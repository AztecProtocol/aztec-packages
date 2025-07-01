#include "barretenberg/vm2/simulation/get_contract_instance.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_event.hpp"

namespace bb::avm2::simulation {

GetContractInstance::GetContractInstance(ExecutionIdManagerInterface& execution_id_manager,
                                         HighLevelMerkleDBInterface& merkle_db,
                                         EventEmitterInterface<GetContractInstanceEvent>& event_emitter,
                                         ContractInstanceManagerInterface& instance_manager)
    : execution_id_manager(execution_id_manager)
    , merkle_db(merkle_db)
    , event_emitter(event_emitter)
    , instance_manager(instance_manager)
{}

void GetContractInstance::get_contract_instance(MemoryInterface& memory,
                                                AztecAddress contract_address,
                                                MemoryAddress dst_offset,
                                                uint8_t member_enum)
{
    const auto& tree_state = merkle_db.get_tree_state();
    GetContractInstanceEvent event{
        .execution_clk = execution_id_manager.get_execution_id(),
        .contract_address = contract_address,
        .dst_offset = dst_offset,
        .member_enum = member_enum,
        .space_id = memory.get_space_id(),
        .nullifier_tree_root = tree_state.nullifierTree.tree.root,
        .public_data_tree_root = tree_state.publicDataTree.tree.root,
    };

    // Memory bounds checking for dst_offset+1
    // Note that execution does address resolution for dst_offset, so we already
    // know that dst_offset is in bounds.
    // So, the only scenario when dstOffset+1 can be out of bounds is if dstOffset == MAX address.
    if (dst_offset == AVM_HIGHEST_MEM_ADDRESS) {
        event_emitter.emit(std::move(event));
        throw GetContractInstanceException("Write dst out of range: " + field_to_string(dst_offset));
    }

    // Member enum validation
    if (member_enum > static_cast<uint8_t>(ContractInstanceMember::MAX)) {
        event_emitter.emit(std::move(event));
        throw GetContractInstanceException("Invalid member enum: " + std::to_string(member_enum));
    }

    // Retrieve contract instance using shared ContractInstanceManager
    auto maybe_instance = instance_manager.get_contract_instance(event.contract_address);
    bool instance_exists = maybe_instance.has_value();
    event.instance_exists = instance_exists;

    // Extract all member values for event (even if we only use one for the memory write)
    // This is needed for the PIL gadget trace generation which includes all retrieved members
    FF selected_member_value = 0; // default if instance does not exist
    if (instance_exists) {
        const auto& instance = maybe_instance.value();
        event.retrieved_deployer_addr = instance.deployer_addr;
        event.retrieved_class_id = instance.current_class_id;
        event.retrieved_init_hash = instance.initialisation_hash;

        // Select the requested member based on the enum
        selected_member_value = select_instance_member(instance, member_enum);
    }

    // Perform two memory writes
    write_results(memory, dst_offset, instance_exists, selected_member_value);

    event_emitter.emit(std::move(event));
}

void GetContractInstance::write_results(MemoryInterface& memory,
                                        MemoryAddress dst_offset,
                                        bool exists,
                                        const FF& member_value)
{
    // Write existence flag (U1) at dst_offset
    memory.set(dst_offset, MemoryValue::from<uint1_t>(exists ? 1 : 0));
    // Write member value (FF) at dst_offset + 1
    memory.set(dst_offset + 1, MemoryValue::from<FF>(member_value));
}

FF GetContractInstance::select_instance_member(const ContractInstance& instance, uint8_t member_enum)
{
    switch (static_cast<ContractInstanceMember>(member_enum)) {
    case ContractInstanceMember::DEPLOYER:
        return instance.deployer_addr;
    case ContractInstanceMember::CLASS_ID:
        return instance.current_class_id;
    case ContractInstanceMember::INIT_HASH:
        return instance.initialisation_hash;
    default:
        throw std::runtime_error("This error should have been handled earlier! Invalid member enum: " +
                                 std::to_string(member_enum));
    }
}

} // namespace bb::avm2::simulation
