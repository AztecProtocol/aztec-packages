#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/interfaces/field_gt.hpp"

namespace bb::avm2::simulation {

ContractInstanceManager::ContractInstanceManager(ContractDBInterface& contract_db,
                                                 HighLevelMerkleDBInterface& merkle_db,
                                                 UpdateCheckInterface& update_check,
                                                 FieldGreaterThanInterface& ff_gt,
                                                 const ProtocolContracts& protocol_contracts,
                                                 EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter)
    : contract_db(contract_db)
    , merkle_db(merkle_db)
    , update_check(update_check)
    , protocol_contracts(protocol_contracts)
    , ff_gt(ff_gt)
    , event_emitter(event_emitter)
{}

/**
 * @brief Retrieves a contract instance from the contract database.
 *
 * If the instance is found, validate that with a nullifier check, perform address derivation, and update checking.
 * If it is NOT found, validate its NON-membership with a nullifier check, and skip the rest.
 *
 * @param contract_address The address of the contract to retrieve. Also the nullifier to check.
 * @return The contract instance if it exists, otherwise std::nullopt.
 *
 * @note Emits a ContractInstanceRetrievalEvent for this contract address at the current roots.
 */
std::optional<ContractInstance> ContractInstanceManager::get_contract_instance(const FF& contract_address)
{
    // If the instance is found, we validate that with a nullifier check, perform address derivation, and update
    // checking. If it is not found, we validate its NON-membership with a nullifier check, and skip the rest.
    // Note: this call to get_contract_instance performs address derivation.
    std::optional<ContractInstance> maybe_instance = contract_db.get_contract_instance(contract_address);

    const auto& tree_state = merkle_db.get_tree_state();

    // Check if this is a protocol contract address (addresses 1 to MAX_PROTOCOL_CONTRACTS).
    // Protocol contracts are special reserved addresses that don't require nullifier checks.
    if (ff_gt.ff_gt(MAX_PROTOCOL_CONTRACTS, contract_address - 1)) {
        // Handle protocol contract addresses.
        // The derived_address lookup returns nullopt if this protocol contract slot is empty.
        // NOTE: MAX_PROTOCOL_CONTRACTS (currently 11) is the reserved capacity, but not all
        // slots may be filled. For example, addresses 1-6 are currently used while 7-11 are
        // empty (reserved for future protocol contracts).
        std::optional<AztecAddress> derived_address = get_derived_address(protocol_contracts, contract_address);

        // Sanity check: if we found a derived address, we should also have the instance, and vice versa.
        BB_ASSERT_EQ(derived_address.has_value(),
                     maybe_instance.has_value(),
                     "Derived address should be found if the instance was retrieved and vice versa");

        event_emitter.emit({
            .address = contract_address,
            .contract_instance = maybe_instance.value_or(ContractInstance{}),
            .nullifier_tree_root = tree_state.nullifier_tree.tree.root,
            .public_data_tree_root = tree_state.public_data_tree.tree.root,
            .exists = derived_address.has_value(),
            .is_protocol_contract = true,
        });
        return maybe_instance;
    }

    if (!merkle_db.nullifier_exists(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_address)) {
        // Emit error event
        event_emitter.emit({
            .address = contract_address,
            .contract_instance = {}, // Empty instance for error case
            .nullifier_tree_root = tree_state.nullifier_tree.tree.root,
            .public_data_tree_root = tree_state.public_data_tree.tree.root,
            .deployment_nullifier = contract_address,
            .exists = false, // Nullifier not found!
        });

        return std::nullopt;
    }

    BB_ASSERT(maybe_instance.has_value(), "Contract instance should be found if nullifier exists");
    const ContractInstance& instance = maybe_instance.value();

    // Validate that the contract instance is the latest if there have been any updates.
    update_check.check_current_class_id(contract_address, instance);

    event_emitter.emit({
        .address = contract_address,
        .contract_instance = instance,
        // Tree context
        .nullifier_tree_root = tree_state.nullifier_tree.tree.root,
        .public_data_tree_root = tree_state.public_data_tree.tree.root,
        .deployment_nullifier = contract_address, // Contract address nullifier
        .exists = true,                           // Nullifier found!
    });

    return instance;
}

} // namespace bb::avm2::simulation
