#include "barretenberg/vm2/simulation/contract_instance_manager.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2::simulation {

ContractInstanceManager::ContractInstanceManager(ContractDBInterface& contract_db,
                                                 HighLevelMerkleDBInterface& merkle_db,
                                                 UpdateCheckInterface& update_check,
                                                 EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter)
    : contract_db(contract_db)
    , merkle_db(merkle_db)
    , update_check(update_check)
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

    // Note: skip canonical/magic address handling for now.
    // TODO(dbanks12): Add magic address handling and skip other checks if it is a magic address.

    if (!merkle_db.nullifier_exists(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_address)) {
        // Emit error event
        const auto& tree_state = merkle_db.get_tree_state();
        event_emitter.emit(
            { .address = contract_address,
              .contract_instance = {}, // Empty instance for error case
              .nullifier_tree_root = tree_state.nullifierTree.tree.root,
              .public_data_tree_root = tree_state.publicDataTree.tree.root,
              .deployment_nullifier = contract_address,
              .nullifier_exists = false, // Nullifier not found!
              .deployer_protocol_contract_address = AztecAddress(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
              .error = true });

        return std::nullopt;
    }

    assert(maybe_instance.has_value() && "Contract instance should be found if nullifier exists");
    const ContractInstance& instance = maybe_instance.value();

    // Validate that the contract instance is the latest if there have been any updates.
    update_check.check_current_class_id(contract_address, instance);

    const auto& tree_state = merkle_db.get_tree_state();
    event_emitter.emit(
        { .address = contract_address,
          .contract_instance = instance,
          // Tree context
          .nullifier_tree_root = tree_state.nullifierTree.tree.root,
          .public_data_tree_root = tree_state.publicDataTree.tree.root,
          .deployment_nullifier = contract_address, // Contract address nullifier
          .nullifier_exists = true,                 // Nullifier found!
          .deployer_protocol_contract_address = AztecAddress(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
          .error = false });

    return instance;
}

} // namespace bb::avm2::simulation
