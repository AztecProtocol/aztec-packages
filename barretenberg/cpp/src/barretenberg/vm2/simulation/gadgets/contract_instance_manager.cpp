#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"

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
    // If this is a canonical address
    if (ff_gt.ff_gt(MAX_PROTOCOL_CONTRACTS, contract_address - 1)) {
        // Handle protocol contract addresses
        std::optional<AztecAddress> derived_address = get_derived_address(protocol_contracts, contract_address);
        assert(derived_address.has_value() == maybe_instance.has_value() &&
               "Derived address should be found if the instance was retrieved and vice versa");
        const ContractInstance& instance = maybe_instance.value();
        event_emitter.emit({
            .address = contract_address,
            .contract_instance = maybe_instance.value_or<ContractInstance>({}),
            // Tree context
            .nullifier_tree_root = tree_state.nullifierTree.tree.root,
            .public_data_tree_root = tree_state.publicDataTree.tree.root,
            .exists = derived_address.has_value(),
            .is_protocol_contract = true,
        });

        return instance;
    }

    if (!merkle_db.nullifier_exists(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_address)) {
        // Emit error event
        event_emitter.emit({
            .address = contract_address,
            .contract_instance = {}, // Empty instance for error case
            .nullifier_tree_root = tree_state.nullifierTree.tree.root,
            .public_data_tree_root = tree_state.publicDataTree.tree.root,
            .deployment_nullifier = contract_address,
            .exists = false, // Nullifier not found!
        });

        return std::nullopt;
    }

    assert(maybe_instance.has_value() && "Contract instance should be found if nullifier exists");
    const ContractInstance& instance = maybe_instance.value();

    // Validate that the contract instance is the latest if there have been any updates.
    update_check.check_current_class_id(contract_address, instance);

    event_emitter.emit({
        .address = contract_address,
        .contract_instance = instance,
        // Tree context
        .nullifier_tree_root = tree_state.nullifierTree.tree.root,
        .public_data_tree_root = tree_state.publicDataTree.tree.root,
        .deployment_nullifier = contract_address, // Contract address nullifier
        .exists = true,                           // Nullifier found!
    });

    return instance;
}

} // namespace bb::avm2::simulation
