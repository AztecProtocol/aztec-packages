#include "barretenberg/vm2/simulation/gadgets/get_contract_instance.hpp"

#include <stdexcept>
#include <string>
#include <utility>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/common/uint1.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Construct a GetContractInstance gadget with its dependencies.
 *
 * @param execution_id_manager Provides monotonic execution clock values for event ordering.
 * @param merkle_db High-level Merkle database for reading tree state (roots).
 * @param event_emitter Emitter for GetContractInstanceEvent used by tracegen.
 * @param instance_manager Manager that retrieves (and caches) contract instances from the world state.
 */
GetContractInstance::GetContractInstance(ExecutionIdManagerInterface& execution_id_manager,
                                         HighLevelMerkleDBInterface& merkle_db,
                                         EventEmitterInterface<GetContractInstanceEvent>& event_emitter,
                                         ContractInstanceManagerInterface& instance_manager)
    : execution_id_manager(execution_id_manager)
    , merkle_db(merkle_db)
    , event_emitter(event_emitter)
    , instance_manager(instance_manager)
{}

/**
 * @brief Retrieve a contract instance member and write the result to memory.
 *
 * Validates that dst_offset+1 is in bounds and that member_enum is valid, then retrieves the
 * contract instance via the ContractInstanceManager. Writes the existence flag (U1) to dst_offset
 * and the selected member value (FF) to dst_offset+1.
 *
 * @param memory The memory interface for the current context.
 * @param contract_address The address of the contract to look up.
 * @param dst_offset The memory offset at which to write the exists flag.
 * @param member_enum The enum selecting which instance member to retrieve
 *                    (deployer/class_id/init_hash/immutables_hash).
 * @throws GetContractInstanceException If dst_offset+1 is out of bounds (checked first).
 * @throws GetContractInstanceException If member_enum is invalid (checked after bounds check).
 */
void GetContractInstance::get_contract_instance(MemoryInterface& memory,
                                                const AztecAddress& contract_address,
                                                MemoryAddress dst_offset,
                                                uint8_t member_enum)
{
    const auto& tree_state = merkle_db.get_tree_state();
    const auto execution_clk = execution_id_manager.get_execution_id();
    const auto space_id = memory.get_space_id();
    const auto& nullifier_tree_root = tree_state.nullifier_tree.tree.root;
    const auto& public_data_tree_root = tree_state.public_data_tree.tree.root;

    // Memory bounds checking for dst_offset+1
    // Note that execution does address resolution for dst_offset, so we already
    // know that dst_offset is in bounds.
    // So, the only scenario when dstOffset+1 can be out of bounds is if dstOffset == MAX address.
    if (dst_offset == AVM_HIGHEST_MEM_ADDRESS) {
        event_emitter.emit({ .execution_clk = execution_clk,
                             .contract_address = contract_address,
                             .dst_offset = dst_offset,
                             .member_enum = member_enum,
                             .space_id = space_id,
                             .nullifier_tree_root = nullifier_tree_root,
                             .public_data_tree_root = public_data_tree_root });
        throw GetContractInstanceException("Write dst out of range: " + field_to_string(dst_offset));
    }

    // Member enum validation
    if (member_enum > static_cast<uint8_t>(ContractInstanceMember::MAX)) {
        event_emitter.emit({ .execution_clk = execution_clk,
                             .contract_address = contract_address,
                             .dst_offset = dst_offset,
                             .member_enum = member_enum,
                             .space_id = space_id,
                             .nullifier_tree_root = nullifier_tree_root,
                             .public_data_tree_root = public_data_tree_root });
        throw GetContractInstanceException("Invalid member enum: " + std::to_string(member_enum));
    }

    // Retrieve contract instance using shared ContractInstanceManager
    auto maybe_instance = instance_manager.get_contract_instance(contract_address);
    const bool instance_exists = maybe_instance.has_value();

    // Select the requested member and write results to memory
    const FF selected_member_value =
        instance_exists ? select_instance_member(maybe_instance.value(), member_enum) : FF(0);
    write_results(memory, dst_offset, instance_exists, selected_member_value);

    event_emitter.emit({
        .execution_clk = execution_clk,
        .contract_address = contract_address,
        .dst_offset = dst_offset,
        .member_enum = member_enum,
        .space_id = space_id,
        .nullifier_tree_root = nullifier_tree_root,
        .public_data_tree_root = public_data_tree_root,
        .instance_exists = instance_exists,
        .retrieved_deployer_addr = instance_exists ? maybe_instance->deployer : FF(0),
        .retrieved_class_id = instance_exists ? maybe_instance->current_contract_class_id : FF(0),
        .retrieved_init_hash = instance_exists ? maybe_instance->initialization_hash : FF(0),
        .retrieved_immutables_hash = instance_exists ? maybe_instance->immutables_hash : FF(0),
    });
}

/**
 * @brief Write the contract instance existence flag and member value to memory.
 *
 * @param memory The memory interface for the current context.
 * @param dst_offset The memory offset at which to write the exists flag (U1).
 * @param exists Whether the contract instance was found.
 * @param member_value The selected member value to write at dst_offset+1 (FF).
 */
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

/**
 * @brief Select a contract instance member by enum value.
 *
 * @param instance The contract instance to select from.
 * @param member_enum The enum value identifying which member to return.
 * @return The field value of the selected member.
 * @throws std::runtime_error If member_enum is not a valid ContractInstanceMember (should be unreachable).
 */
FF GetContractInstance::select_instance_member(const ContractInstance& instance, uint8_t member_enum)
{
    switch (static_cast<ContractInstanceMember>(member_enum)) {
    case ContractInstanceMember::DEPLOYER:
        return instance.deployer;
    case ContractInstanceMember::CLASS_ID:
        return instance.current_contract_class_id;
    case ContractInstanceMember::INIT_HASH:
        return instance.initialization_hash;
    case ContractInstanceMember::IMMUTABLES_HASH:
        return instance.immutables_hash;
    default:
        throw std::runtime_error("This error should have been handled earlier! Invalid member enum: " +
                                 std::to_string(member_enum));
    }
}

} // namespace bb::avm2::simulation
